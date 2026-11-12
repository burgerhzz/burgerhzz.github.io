# burgerhzz.github.io

BURGERHZZ 軍火庫：作品集與自製工具的入口頁，不做販售。

線上位址：https://burgerhzz.github.io

## 內容

- 作品集：Burger Film Studio → https://burgerhzz.github.io/burger-film-studio/
- burgerSub（開放下載）→ `apps/`（https://burgerhzz.github.io/apps/）
- burgerbo、burgerGuide：只有介紹，標「自用中／尚未開放下載」

沒有建置步驟（只有 Google Fonts 一個外部字型），改完直接 push，GitHub Pages 會自動重新發佈。
瀏覽器會快取約 10 分鐘，推完看不到新版就按 ⌘⇧R。

## 配樂與進站畫面

- `bgm.js`：首頁和 `/apps/` 共用的 Web Audio 合成配樂。換頁一定會斷，所以用 sessionStorage
  記「這個分頁開著配樂」（`bgm`）和起始時間（`bgm_t0`），下一頁從同一拍接著播；
  瀏覽器擋自動出聲時，等第一次點擊再接上
- 兩頁都有進站畫面（點擊就是瀏覽器要的出聲手勢）。同一分頁進過站就不再出現，
  `/apps/` 在載入當下就判斷並移除，避免長頁面閃一下
- 頁面要有 `id="sfx"` 的按鈕（內含 `id="sfxLabel"`）才有開關

## 待辦

- [ ] 補上 og:image（社群分享時的預覽圖，建議 1200×630）

## 注意

這個 repo 是 public（GitHub Pages 免費方案的必要條件），
只放網頁，不含任何外掛原始碼。外掛在各自的 private repo。
