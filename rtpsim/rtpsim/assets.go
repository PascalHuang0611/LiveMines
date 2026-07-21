package main

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

//go:embed sim_config.example.json
var embeddedSimConfigJSON []byte

// 七份機率表檔名（與 math_configs.files 對齊）
var expectedMathConfigFiles = map[string]string{
	"BASE": "TG001_LM01_BASE_Config.json",
	"PRT1": "TG001_LM01_PRT1_Config.json",
	"PRT2": "TG001_LM01_PRT2_Config.json",
	"PRT3": "TG001_LM01_PRT3_Config.json",
	"BST1": "TG001_LM01_BST1_Config.json",
	"BST2": "TG001_LM01_BST2_Config.json",
	"BST3": "TG001_LM01_BST3_Config.json",
}

// AppBundle 執行檔同目錄下的資料檔
type AppBundle struct {
	Dir       string
	MathDir   string
	CSVPath   string
	CSVRows   int
	MathFiles map[string]string // key -> 絕對路徑
}

// ExecutableDir 回傳執行檔所在目錄（開發時 go run 則為目前工作目錄）
func ExecutableDir() string {
	ex, err := os.Executable()
	if err != nil {
		return "."
	}
	dir := filepath.Dir(ex)
	// macOS .app 內容物在 Contents/MacOS
	if strings.HasSuffix(strings.ToLower(dir), ".app/contents/macos") ||
		strings.Contains(dir, ".app/Contents/MacOS") {
		return dir
	}
	return dir
}

// DiscoverAppBundle 在 dir 內自動尋找七份 JSON 與開獎 CSV
func DiscoverAppBundle(dir string) (*AppBundle, error) {
	if dir == "" {
		dir = ExecutableDir()
	}
	b := &AppBundle{Dir: dir, MathDir: dir, MathFiles: make(map[string]string, len(expectedMathConfigFiles))}

	for key, fname := range expectedMathConfigFiles {
		p := filepath.Join(dir, fname)
		if _, err := os.Stat(p); err != nil {
			return nil, fmt.Errorf("缺少機率表 %s（請與執行檔放在同一目錄）: %w", fname, err)
		}
		b.MathFiles[key] = p
	}

	csvPath, err := findReplayCSV(dir)
	if err != nil {
		return nil, err
	}
	b.CSVPath = csvPath
	rounds, err := LoadReplayCSV(csvPath)
	if err != nil {
		return nil, fmt.Errorf("讀取開獎 CSV 失敗: %w", err)
	}
	b.CSVRows = len(rounds)
	return b, nil
}

func findReplayCSV(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", fmt.Errorf("讀取目錄 %s 失敗: %w", dir, err)
	}
	var candidates []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.EqualFold(filepath.Ext(name), ".csv") {
			candidates = append(candidates, filepath.Join(dir, name))
		}
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("目錄 %s 內找不到 .csv 開獎檔", dir)
	}
	// 優先 LM_Qualified
	for _, p := range candidates {
		if strings.Contains(strings.ToLower(filepath.Base(p)), "qualified") {
			if _, err := LoadReplayCSV(p); err == nil {
				return p, nil
			}
		}
	}
	for _, p := range candidates {
		if _, err := LoadReplayCSV(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("目錄 %s 內無含 ball1/ball2/ball3 的有效 CSV", dir)
}

// ConfigFromBundle 內嵌預設設定 + 同目錄機率表 / CSV
func ConfigFromBundle(bundle *AppBundle) (*Config, error) {
	cfg, err := LoadConfigFromBytes(embeddedSimConfigJSON)
	if err != nil {
		return nil, err
	}
	cfg.MathConfigs.BaseDir = bundle.MathDir
	for key, fname := range expectedMathConfigFiles {
		cfg.MathConfigs.Files[key] = fname
	}
	cfg.Output.Dir = filepath.Join(bundle.Dir, "rtpsim_out")
	return cfg, nil
}
