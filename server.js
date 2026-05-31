import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import translatte from 'translatte';
import { config } from './config.js';
import { buildPlaylist, getUserId, fetchSongs, generateM3U } from './generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Middleware для парсинга JSON-запросов
app.use(express.json());

// Простой кэш в оперативной памяти для динамических запросов
// Формат: key -> { content: string, expiresAt: number }
const playlistCache = new Map();

/**
 * Очищает истекший кэш раз в 10 минут
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of playlistCache.entries()) {
    if (now > value.expiresAt) {
      playlistCache.delete(key);
    }
  }
}, 1000 * 60 * 10);

// Настройка CORS заголовков, чтобы веб-плееры могли читать плейлист напрямую из браузера
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Маршрут для перевода текста песни
app.post('/translate', async (req, res) => {
  const { text, to } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required for translation.' });
  }

  try {
    console.log(`[Server] Translating text to: ${to || 'ru'}`);
    const result = await translatte(text, { to: to || 'ru' });
    return res.json({ text: result.text });
  } catch (err) {
    console.error('[Server] Translation error:', err.message || err);
    return res.status(500).json({ error: err.message || 'Translation failed.' });
  }
});

// Маршрут для отдачи плейлиста (поддерживает и /radio, и упрощенный /radio.m3u)
app.get(['/radio', '/radio.m3u'], async (req, res) => {
  const isSimplified = req.path.endsWith('.m3u');
  const filename = isSimplified ? 'radio.m3u' : 'radio';

  // Получаем параметры из строки запроса (если переданы)
  const usernameParam = req.query.username || req.query.usernames || req.query.user;
  const loopParam = req.query.loop || req.query.repeat;
  const sortParam = req.query.sort || req.query.sortBy;
  const shuffleParam = req.query.shuffle || req.query.random;

  // Устанавливаем правильный Content-Type для M3U плейлистов
  res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');

  // Если переданы кастомные query-параметры, генерируем плейлист на лету
  if (usernameParam) {
    const loopCount = loopParam ? parseInt(loopParam, 10) : config.loopCount;
    const sortBy = sortParam || config.sortBy;
    const shuffle = shuffleParam !== undefined ? shuffleParam === 'true' : config.shuffle;
    
    // Превращаем строку с пользователями (возможно, через запятую) в массив
    const usersArray = usernameParam.split(',').map(u => u.trim()).filter(Boolean);
    const sortedUsersStr = [...usersArray].sort().join(',');

    const cacheKey = `${sortedUsersStr.toLowerCase()}-${loopCount}-${sortBy}-${shuffle}${isSimplified ? '-simplified' : ''}`;
    const cached = playlistCache.get(cacheKey);
    const now = Date.now();

    if (cached && now < cached.expiresAt) {
      console.log(`[Server] Отдача плейлиста из кэша для [${usersArray.join(', ')}] (Упрощенный: ${isSimplified}, Рандомизация: ${shuffle}, зацикливание: ${loopCount})`);
      return res.send(cached.content);
    }

    console.log(`[Server] Динамический запрос для [${usersArray.join(', ')}] (Упрощенный: ${isSimplified}, Зацикливание: ${loopCount}, рандомизация: ${shuffle}, сортировка: ${sortBy}). Генерация...`);
    
    try {
      let allSongs = [];
      
      // Собираем песни со всех аккаунтов на лету
      for (const username of usersArray) {
        try {
          const userId = await getUserId(username);
          const userSongs = await fetchSongs(userId, sortBy);
          allSongs.push(...userSongs);
        } catch (userError) {
          console.error(`[Server] Ошибка при сборе треков для @${username}:`, userError.message);
        }
      }

      if (allSongs.length === 0) {
        res.status(404);
        return res.send(`#EXTM3U\n# Ошибка: Не найдено публичных песен для аккаунтов [${usersArray.join(', ')}].`);
      }

      // Удаляем дубликаты
      const uniqueSongsMap = new Map();
      for (const song of allSongs) {
        if (song.id) {
          uniqueSongsMap.set(song.id, song);
        }
      }
      const uniqueSongs = Array.from(uniqueSongsMap.values());

      const m3uContent = generateM3U(uniqueSongs, loopCount, usersArray, shuffle, isSimplified);
      
      // Сохраняем в кэш
      playlistCache.set(cacheKey, {
        content: m3uContent,
        expiresAt: now + config.cacheTTL
      });

      return res.send(m3uContent);
    } catch (error) {
      console.error(`[Server] Ошибка при динамической генерации для [${usersArray.join(', ')}]:`, error.message);
      res.status(500);
      return res.send(`#EXTM3U\n# Ошибка генерации: ${error.message}`);
    }
  }

  // Если параметров нет, отдаем статический файл (radio или radio.m3u) из корня проекта
  const staticPlaylistPath = path.join(__dirname, filename);
  
  try {
    // Проверяем существование статического файла
    await fs.access(staticPlaylistPath);
    console.log(`[Server] Отдача статического файла плейлиста '${filename}'`);
    
    const content = await fs.readFile(staticPlaylistPath, 'utf-8');
    return res.send(content);
  } catch (error) {
    // Если файла нет, автоматически собираем его для пользователей по умолчанию при первом запросе
    console.log(`[Server] Статический файл '${filename}' не найден. Автоматическая генерация для [${config.defaultUsernames.join(', ')}]...`);
    
    try {
      const generatedPath = await buildPlaylist(config.defaultUsernames, config.loopCount, config.sortBy, config.shuffle);
      const targetPath = isSimplified ? `${generatedPath}.m3u` : generatedPath;
      const content = await fs.readFile(targetPath, 'utf-8');
      return res.send(content);
    } catch (genError) {
      console.error(`[Server] Не удалось автосгенерировать плейлист при старте:`, genError.message);
      res.status(500);
      return res.send(`#EXTM3U\n# Ошибка автогенерации: ${genError.message}`);
    }
  }
});

// Страница приветствия на корневом адресе
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <html>
      <head>
        <title>Suno AI M3U Radio Server</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; background-color: #121214; color: #e1e1e6; }
          h1 { color: #04d361; border-bottom: 1px solid #29292e; padding-bottom: 10px; }
          code { background-color: #202024; padding: 4px 8px; border-radius: 4px; color: #ff79c6; font-size: 0.9em; }
          pre { background-color: #202024; padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #29292e; }
          a { color: #8b5cf6; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .card { background-color: #202024; border: 1px solid #29292e; border-radius: 8px; padding: 20px; margin-top: 20px; }
          .highlight { color: #04d361; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Suno AI Radio Server 📻</h1>
        <p>Ваш сервер запущен и готов к раздаче плейлиста!</p>
        
        <div class="card">
          <h3>🔗 Ссылки на плейлисты по умолчанию (${config.defaultUsernames.map(u => '@' + u).join(', ')}):</h3>
          <p>📝 <strong>Подробный плейлист (с текстами песен и ID):</strong><br>
          <a href="/radio" target="_blank" class="highlight">http://localhost:${config.port}/radio</a></p>
          <p>📻 <strong>Упрощенный плейлист (без текстов, максимальная совместимость с плеерами):</strong><br>
          <a href="/radio.m3u" target="_blank" class="highlight">http://localhost:${config.port}/radio.m3u</a></p>
        </div>

        <div class="card">
          <h3>⚡ Динамические возможности (на лету):</h3>
          <p>Вы можете сгенерировать плейлист для <strong>одного или нескольких</strong> пользователей Suno, просто передав их через запятую в параметре. Поддерживаются оба формата (подробный и упрощенный):</p>
          <ul>
            <li>Плейлист для одного юзера (упрощенный): <br><code>/radio.m3u?username=ИМЯ_ЮЗЕРА</code></li>
            <li>Плейлист для нескольких авторов вместе (подробный): <br><code>/radio?username=kinkypanda,another_user</code></li>
            <li>Задать зацикливание (повторить песни 10 раз): <br><code>/radio.m3u?username=kinkypanda&loop=10</code></li>
            <li>Включить или отключить перемешивание (shuffle): <br><code>/radio.m3u?username=kinkypanda&shuffle=true</code> или <code>/radio.m3u?username=kinkypanda&shuffle=false</code></li>
            <li>Сортировка по новизне (вместо популярности): <br><code>/radio.m3u?username=kinkypanda&sort=created_at</code></li>
          </ul>
        </div>

        <div class="card">
          <h3>🔌 Как запустить во внешний мир с ngrok:</h3>
          <pre>ngrok http ${config.port}</pre>
          <p>После этого используйте выданную ссылку формата <code>https://xxxx.ngrok-free.app/radio</code> или <code>https://xxxx.ngrok-free.app/radio.m3u</code> в любом IPTV-плеере, VLC, Kodi или OttPlayer!</p>
        </div>
      </body>
    </html>
  `);
});

// Запуск сервера
app.listen(config.port, async () => {
  console.log(`==================================================`);
  console.log(`📻 Express сервер радио запущен на порту ${config.port}`);
  console.log(`🔗 Локальный адрес плейлиста (подробный): http://localhost:${config.port}/radio`);
  console.log(`🔗 Локальный адрес плейлиста (упрощенный): http://localhost:${config.port}/radio.m3u`);
  console.log(`==================================================`);
  
  // При старте проверяем наличие файлов плейлистов, если их нет — создаем фоном для быстродействия первого запроса
  const staticPlaylistPath = path.join(__dirname, 'radio');
  const staticPlaylistM3uPath = path.join(__dirname, 'radio.m3u');
  try {
    await fs.access(staticPlaylistPath);
    await fs.access(staticPlaylistM3uPath);
    console.log(`[Server] Найдены готовые статические файлы 'radio' и 'radio.m3u'. Они будут отдаваться по умолчанию.`);
  } catch {
    console.log(`[Server] Статические файлы плейлистов отсутствуют. Запуск фоновой предварительной генерации...`);
    buildPlaylist(config.defaultUsernames, config.loopCount, config.sortBy, config.shuffle)
      .then(() => console.log(`[Server] Фоновая генерация завершена. Файлы 'radio' и 'radio.m3u' успешно созданы.`))
      .catch((err) => console.error(`[Server] Ошибка фоновой генерации при старте:`, err.message));
  }
});
