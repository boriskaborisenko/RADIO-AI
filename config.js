export const config = {
  // Список имен пользователей Suno по умолчанию (поддерживается массив аккаунтов)
  //defaultUsernames: ['kinkypanda', 'ttt13666'],
  defaultUsernames: ['kinkypanda'],
  
  // Перемешивать ли треки случайным образом для разнообразия эфира (true/false)
  shuffle: true,
  
  // Порт Express сервера (с поддержкой динамического биндинга портов в Docker/Render)
  port: process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3333),
  
  // Сколько раз повторить список треков внутри одного плейлиста для бесконечной зацикленности.
  // Например, если песен 50, а loopCount = 10, в плейлисте будет 500 треков подряд.
  loopCount: 5,
  
  // Время жизни кэша для динамических запросов в миллисекундах (30 минут по умолчанию).
  // Это предотвращает слишком частые обращения к API Suno при обновлении страницы.
  cacheTTL: 1000 * 60 * 30,
  
  // Сортировка треков по умолчанию при получении от API.
  // Возможные варианты: 'upvote_count' (по лайкам) или 'created_at' (по новизне)
  sortBy: 'upvote_count',
  
  // Заголовки для обхода защиты от ботов
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
