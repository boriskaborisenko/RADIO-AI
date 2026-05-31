import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Получает ID пользователя по его имени на Suno
 * @param {string} username Имя пользователя (например, 'kinkypanda')
 * @returns {Promise<string>}
 */
export async function getUserId(username) {
  const profileUrl = `https://suno.com/@${username}`;
  
  console.log(`[Parser] Получение страницы профиля для @${username}...`);
  
  const response = await fetch(profileUrl, {
    headers: {
      'User-Agent': config.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3'
    }
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить профиль @${username} (Статус: ${response.status})`);
  }

  const html = await response.text();
  
  // Регулярные выражения для поиска user_id или external_user_id в JS-скриптах Next.js
  const userIdRegex = /user_id.*?([a-f0-9-]{36})/i;
  const externalUserIdRegex = /external_user_id.*?([a-f0-9-]{36})/i;
  
  const match = html.match(userIdRegex) || html.match(externalUserIdRegex);
  
  if (!match) {
    throw new Error(`Не удалось извлечь user_id для @${username}. Возможно, профиль приватный или формат страницы изменился.`);
  }

  const userId = match[1];
  console.log(`[Parser] Успешно найден ID пользователя: ${userId}`);
  return userId;
}

/**
 * Скачивает все публичные песни пользователя по его ID
 * @param {string} userId UUID пользователя на Suno
 * @param {string} [sortBy] Сортировка (upvote_count или created_at)
 * @returns {Promise<Array>}
 */
export async function fetchSongs(userId, sortBy = config.sortBy) {
  console.log(`[Parser] Начинаем сбор треков для ID: ${userId}...`);
  
  let songs = [];
  let cursor = '';
  let hasMore = true;
  let page = 1;

  while (hasMore) {
    console.log(`[Parser] Запрос страницы ${page} (cursor: "${cursor}")...`);
    
    const response = await fetch('https://studio-api-prod.suno.com/api/unified/feed', {
      method: 'POST',
      headers: {
        'User-Agent': config.userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        feed_id: 'user_songs',
        target_user_id: userId,
        request_metadata: {
          sort_by: sortBy
        },
        cursor: cursor,
        page_size: 50 // Максимальный разрешенный размер страницы для быстроты
      })
    });

    if (!response.ok) {
      throw new Error(`Ошибка API Suno при запросе страницы ${page} (Статус: ${response.status})`);
    }

    const data = await response.json();
    const items = data.feed?.items || [];

    if (items.length === 0) {
      console.log(`[Parser] Страница ${page} пуста. Сбор завершен.`);
      break;
    }

    let pageClipsCount = 0;
    for (const item of items) {
      if (item.content_type === 'clip' && item.content_item) {
        songs.push(item.content_item);
        pageClipsCount++;
      }
    }

    console.log(`[Parser] Получено ${pageClipsCount} треков со страницы ${page}. Всего собрано: ${songs.length}`);

    const nextCursor = data.feed?.next_cursor;
    
    // Если следующего курсора нет, или он пустой, или равен текущему — завершаем
    if (!nextCursor || nextCursor === cursor) {
      hasMore = false;
    } else {
      cursor = nextCursor;
      page++;
    }
  }

  // Удаляем дубликаты по ID (на всякий случай)
  const uniqueSongsMap = new Map();
  for (const song of songs) {
    if (song.id) {
      uniqueSongsMap.set(song.id, song);
    }
  }
  const uniqueSongs = Array.from(uniqueSongsMap.values());
  
  console.log(`[Parser] Сбор завершен. Успешно обработано уникальных треков: ${uniqueSongs.length}`);
  return uniqueSongs;
}

/**
 * Генерирует содержимое плейлиста в формате M3U
 * @param {Array} songs Список треков
 * @param {number} loopCount Количество повторов всего плейлиста
 * @param {Array<string>|string} usernames Имена пользователей для подписи
 * @param {boolean} shuffle Перемешивать ли треки
 * @param {boolean} simplified Генерировать ли упрощенную версию без слов и ID
 * @returns {string}
 */
export function generateM3U(songs, loopCount = config.loopCount, usernames = config.defaultUsernames, shuffle = config.shuffle, simplified = false) {
  console.log(`[Generator] Генерация M3U плейлиста (треков: ${songs.length}, циклов повтора: ${loopCount}, перемешивание: ${shuffle}, упрощенный: ${simplified})...`);
  
  let m3u = `#EXTM3U\n`;
  // Добавляем теги для плееров, помогающие зацикливанию
  m3u += `#EXT-X-PLAYLIST-TYPE:EVENT\n`;
  m3u += `#EXT-X-ALLOW-CACHE:YES\n\n`;

  let totalAddedCount = 0;

  // Хелпер для очистки текста от переносов строк и двойных кавычек,
  // чтобы не сломать строковый формат M3U-плейлиста
  const clean = (val) => {
    if (!val) return '';
    return String(val)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/"/g, "'")
      .trim();
  };

  // Хелпер для очистки текста песен с сохранением переносов строк (экранирование \n)
  const cleanLyrics = (val) => {
    if (!val) return '';
    return String(val)
      .replace(/[\r\n]+/g, '\\n')
      .replace(/"/g, "'")
      .trim();
  };

  // Алгоритм Фишера-Йетса для случайного перемешивания массива
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  };

  // Преобразуем подпись авторов в строку
  const usernamesString = Array.isArray(usernames) ? usernames.join(', ') : usernames;

  for (let i = 0; i < loopCount; i++) {
    // Делаем копию списка песен для этого прохода цикла
    let currentLoopSongs = [...songs];
    
    // Если перемешивание включено, перемешиваем текущий цикл независимо!
    // Это дает разный порядок треков при каждом повторе плейлиста.
    if (shuffle) {
      shuffleArray(currentLoopSongs);
    }

    for (const song of currentLoopSongs) {
      // Ссылка на MP3 обязательна
      const audioUrl = song.audio_url;
      if (!audioUrl) continue;

      const duration = Math.round(song.metadata?.duration || -1);
      const tvgLogo = song.image_url || song.image_large_url || '';
      
      // Жанр/Теги
      const groupTitle = clean(song.metadata?.tags || song.display_tags || 'Suno AI');
      
      // Исполнитель (используем имя автора на Suno)
      const artist = clean(song.display_name || song.handle || `@${usernamesString}`);
      
      // Название песни
      const title = clean(song.title || 'Untitled Song');

      if (simplified) {
        m3u += `#EXTINF:${duration} tvg-logo="${tvgLogo}" group-title="${groupTitle}",${artist} - ${title}\n`;
      } else {
        // Слова/Текст песни
        const prompt = song.metadata?.prompt || '';
        const hasVerse = prompt.toLowerCase().includes('[verse');
        const wordsAttr = hasVerse ? `words="${cleanLyrics(prompt)}"` : 'words=""';
        const videoAttr = song.video_cover_url ? `video-cover-url="${song.video_cover_url}"` : 'video-cover-url=""';

        m3u += `#EXTINF:${duration} tvg-logo="${tvgLogo}" group-title="${groupTitle}" suno-id="${song.id || ''}" ${wordsAttr} ${videoAttr},${artist} - ${title}\n`;
      }
      m3u += `${audioUrl}\n\n`;
      totalAddedCount++;
    }
  }

  console.log(`[Generator] Плейлист сгенерирован. Всего строк-записей в плейлисте: ${totalAddedCount}`);
  return m3u;
}

/**
 * Основной рабочий процесс сборщика с поддержкой мульти-аккаунтов и перемешивания
 * @param {Array<string>|string} usernames
 * @param {number} loopCount
 * @param {string} sortBy
 * @param {boolean} shuffle
 * @returns {Promise<string>} Возвращает путь к сгенерированному файлу
 */
export async function buildPlaylist(usernames = config.defaultUsernames, loopCount = config.loopCount, sortBy = config.sortBy, shuffle = config.shuffle) {
  try {
    const usersArray = Array.isArray(usernames)
      ? usernames
      : typeof usernames === 'string'
        ? usernames.split(',').map(u => u.trim()).filter(Boolean)
        : config.defaultUsernames;

    console.log(`[Generator] Запуск сборки плейлиста для аккаунтов: [${usersArray.join(', ')}]`);

    let allSongs = [];

    // Собираем треки со всех аккаунтов
    for (const username of usersArray) {
      try {
        const userId = await getUserId(username);
        const userSongs = await fetchSongs(userId, sortBy);
        allSongs.push(...userSongs);
      } catch (userError) {
        console.error(`[Generator] Пропуск аккаунта @${username} из-за ошибки:`, userError.message);
      }
    }

    if (allSongs.length === 0) {
      throw new Error(`Не удалось собрать ни одной публичной песни для указанных аккаунтов.`);
    }

    // Удаляем дубликаты по ID трека (если песня встречается несколько раз)
    const uniqueSongsMap = new Map();
    for (const song of allSongs) {
      if (song.id) {
        uniqueSongsMap.set(song.id, song);
      }
    }
    const uniqueSongs = Array.from(uniqueSongsMap.values());
    console.log(`[Generator] Общий пул уникальных треков со всех аккаунтов: ${uniqueSongs.length}`);

    const m3uContent = generateM3U(uniqueSongs, loopCount, usersArray, shuffle, false);
    const m3uContentSimplified = generateM3U(uniqueSongs, loopCount, usersArray, shuffle, true);
    const outputPath = path.join(__dirname, 'radio');
    const outputPathSimplified = path.join(__dirname, 'radio.m3u');
    
    await fs.writeFile(outputPath, m3uContent, 'utf-8');
    await fs.writeFile(outputPathSimplified, m3uContentSimplified, 'utf-8');
    console.log(`[Generator] Успешно сохранен файл плейлиста: ${outputPath}`);
    console.log(`[Generator] Успешно сохранен упрощенный файл плейлиста: ${outputPathSimplified}`);
    
    return outputPath;
  } catch (error) {
    console.error(`[Generator] Ошибка при сборке плейлиста:`, error.message);
    throw error;
  }
}

// Запуск напрямую как скрипта генератора из консоли (npm run generate)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const usernamesArg = process.argv[2] || config.defaultUsernames.join(',');
  const loopCount = process.argv[3] ? parseInt(process.argv[3], 10) : config.loopCount;
  const sortBy = process.argv[4] || config.sortBy;
  const shuffle = process.argv[5] !== undefined ? process.argv[5] === 'true' : config.shuffle;

  const usernames = usernamesArg.split(',').map(u => u.trim()).filter(Boolean);

  console.log(`=== Suno M3U Playlist Generator ===`);
  console.log(`Аккаунты: ${usernames.map(u => '@' + u).join(', ')}`);
  console.log(`Повторов плейлиста (loopCount): ${loopCount}`);
  console.log(`Рандомизация (shuffle): ${shuffle}`);
  console.log(`Сортировка: ${sortBy}`);
  console.log(`-----------------------------------`);

  buildPlaylist(usernames, loopCount, sortBy, shuffle)
    .then((filePath) => {
      console.log(`\n🎉 Готово! Файл плейлиста доступен локально: ${filePath}`);
      console.log(`Вы можете загрузить этот файл на любой хостинг или запустить сервер: npm start`);
    })
    .catch((err) => {
      console.error(`\n❌ Сборка завершилась ошибкой:`, err.message);
      process.exit(1);
    });
}
