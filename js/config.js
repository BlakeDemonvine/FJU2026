/* =====================================================================
 * 設定檔 — 部署後只需要改這一個檔案
 * ===================================================================== */

window.APP_CONFIG = {

  /**
   * Apps Script 網頁應用程式網址。
   * 在 Apps Script 按「部署 → 新增部署作業 → 網頁應用程式」後取得，
   * 長得像：https://script.google.com/macros/s/AKfycb..../exec
   */
  GAS_URL: 'https://script.google.com/macros/s/AKfycbypPqYiJs4DlHnqSG81OAaH6ugloOHUVL9oNyaRzc3qQt0M8jEz-GJocvsu2v3r3xjr/exec',

  /** 活動名稱（顯示在頁首與瀏覽器分頁） */
  EVENT_TITLE: '2026原力萌芽 幸福親子園遊會',

  /** 主視覺橫幅圖片路徑 */
  BANNER: 'assets/fju2026.jpg',

  /** 上傳前把照片壓到這個寬度以內（像素），可降低 Drive 負擔與上傳時間 */
  PHOTO_MAX_WIDTH: 1600,

  /** 壓縮後的 JPEG 品質 0~1 */
  PHOTO_QUALITY: 0.82,

  /** 攤位列表自動重新整理間隔（毫秒），設 0 關閉 */
  AUTO_REFRESH_MS: 60000,

  /** 攤位詳情頁幻燈片自動換頁間隔（毫秒） */
  SLIDESHOW_MS: 3500
};
