export const config = {
  // Ссылка на стрим плейлиста по умолчанию (указана пользователем)
  streamUrl: 'https://test-server.ngrok.dev/radio',
  
  // Название радиостанции
  stationName: 'AI Radio',
  
  // Дополнительные авторы для быстрого переключения в плеере
  featuredStations: [
    { name: 'Pixie Blu (Rock/Pop)', query: 'kinkypanda' },
    { name: 'Dreamy Lofi', query: 'dreamy_lofi' },
    { name: 'Cyberpunk beats', query: 'cyber_punk' }
  ]
};
