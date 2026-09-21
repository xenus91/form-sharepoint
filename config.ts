// config.ts
export const API_BASE_URL = import.meta.env.DEV
  ? '/api' // в режиме разработки используется прокси
  : (() => {
      const { origin, pathname } = window.location;
      const marker = '/sitepages'; // сегмент, после которого не включаем в базовый URL
      const lowerPath = pathname.toLowerCase();

      // При размещении в SharePoint чаще всего путь содержит /sites/<site-name>/...
      // Например: /sites/obrazceo/SitePages/app.aspx
      const sitesMatch = pathname.match(/\/sites\/[^/]+/i);
      if (sitesMatch?.[0]) {
        return `${origin}${sitesMatch[0]}/_api`;
      }

      const index = lowerPath.indexOf(marker);
      if (index !== -1) {
        // Берем часть URL до "/sitepages" и добавляем "/_api"
        return origin + pathname.substring(0, index) + '/_api';
      }

      // Безопасный fallback: хотя бы корневой _api (чтобы не терять сегмент /_api)
      return `${origin}/_api`;
    })();
