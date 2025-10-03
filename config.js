// config.ts
export const API_BASE_URL = import.meta.env.DEV
  ? '/api' // в режиме разработки используется прокси
  : (() => {
      const { origin, pathname } = window.location;
      const marker = '/SitePages'; // сегмент, после которого не включаем в базовый URL
      const lowerPath = pathname.toLowerCase();
      const index = lowerPath.indexOf(marker);
      if (index !== -1) {
        // Берем часть URL до "/timesheet" и добавляем "/_api"
        return origin + pathname.substring(0, index) + '/_api';
      }
      return origin;
    })();
