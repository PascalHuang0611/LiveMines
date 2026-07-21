# LiveMines RTP 模擬器 — GUI 版

本機 **Web UI**（純 Go，無 OpenGL/CGO）。執行後自動開啟瀏覽器，七份機率表 JSON 與開獎 CSV 放在**執行檔同一目錄**即可。

## 資料目錄結構

完整分發範本見 `dist/`（含 7 份 JSON + 開獎 CSV）。將建置好的 `rtpsim-gui` 放入 `dist/` 後整包分發即可。

```
dist/
  rtpsim-gui             執行檔（建置後放入）
  TG001_LM01_BASE_Config.json
  …（共 7 份）
  LM_Qualified_test_data….csv
  rtpsim_gui_prefs.json  （首次儲存後自動產生）
```

同步最新資料檔：`prepare_dist.bat` / `prepare_dist.sh`

## 建置

### Windows GUI

```cmd
cd gms\tools\rtpsim
build_gui.bat
```

### Mac GUI（或在 Mac 上本地建置）

```bash
cd gms/tools/rtpsim
chmod +x build_gui.sh
./build_gui.sh
```

### Windows 交叉編譯 Mac 版（同 testrobot）

```cmd
cd gms\tools\rtpsim
create_MAC_ver.bat
```

產出 `dist/rtpsim-gui`，可在 Apple Silicon Mac 上執行。

## 使用方式

1. 雙擊 `rtpsim-gui`（或終端機執行），瀏覽器會自動開啟。
2. 確認資料檔狀態為 ✓。
3. 設定參數後按「開始計算」。
4. 右側結果為 Tab 分隔文字，可複製貼到 Excel。
5. 參數儲存於同目錄 `rtpsim_gui_prefs.json`。

## 功能

| 項目 | 說明 |
|------|------|
| 下注人數 | 可輸入，會記住上次值 |
| 單格下注額 | bet_per_position |
| CSV 循環次數 | 總局數 = CSV 行數 × cycles |
| EXTRA 比例 | 0–100% |
| 下注策略 | 下拉：all9 / random / optimal |
| 模擬 | Replay 三跑對比（含購買 EXTRA 子集 RTP） |

## CLI 版（開發用）

```bash
go build -tags '!gui' -o rtpsim .
```
