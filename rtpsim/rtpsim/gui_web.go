//go:build gui

package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"sync"
	"time"
)

//go:embed web/index.html
var webIndexHTML []byte

type bundleInfoResp struct {
	Dir     string `json:"dir,omitempty"`
	CSVPath string `json:"csv_path,omitempty"`
	CSVRows int    `json:"csv_rows,omitempty"`
	Error   string `json:"error,omitempty"`
}

type jobResp struct {
	Running bool   `json:"running"`
	Report  string `json:"report,omitempty"`
	Summary string `json:"summary,omitempty"`
	Error   string `json:"error,omitempty"`
}

type guiJob struct {
	mu      sync.Mutex
	running bool
	report  string
	summary string
	err     string
}

func (j *guiJob) snapshot() jobResp {
	j.mu.Lock()
	defer j.mu.Unlock()
	return jobResp{
		Running: j.running,
		Report:  j.report,
		Summary: j.summary,
		Error:   j.err,
	}
}

func (j *guiJob) start(bundle *AppBundle, prefs GUIPrefs) error {
	j.mu.Lock()
	if j.running {
		j.mu.Unlock()
		return fmt.Errorf("已有計算進行中")
	}
	j.running = true
	j.report = ""
	j.summary = ""
	j.err = ""
	j.mu.Unlock()

	go func() {
		res, err := RunGUISimulation(prefs.toRunRequest(bundle))
		j.mu.Lock()
		defer j.mu.Unlock()
		j.running = false
		if err != nil {
			j.err = err.Error()
			return
		}
		j.report = res.Report
		j.summary = res.SummaryLine
	}()
	return nil
}

func runGUIApp() {
	bundle, bundleErr := DiscoverAppBundle(ExecutableDir())
	var bundlePtr *AppBundle
	if bundleErr == nil {
		bundlePtr = bundle
	}

	job := &guiJob{}
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(webIndexHTML)
	})

	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		writeHTTPJSON(w, bundleInfo(bundle, bundleErr))
	})

	mux.HandleFunc("/api/prefs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeHTTPJSON(w, LoadGUIPrefs())
		case http.MethodPost:
			var p GUIPrefs
			if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := ValidateGUIPrefs(p); err != nil {
				writeHTTPError(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := SaveGUIPrefs(p); err != nil {
				writeHTTPError(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/run", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if bundleErr != nil {
			writeHTTPError(w, bundleErr.Error(), http.StatusBadRequest)
			return
		}
		var p GUIPrefs
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeHTTPError(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := ValidateGUIPrefs(p); err != nil {
			writeHTTPError(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = SaveGUIPrefs(p)
		if err := job.start(bundlePtr, p); err != nil {
			writeHTTPError(w, err.Error(), http.StatusConflict)
			return
		}
		writeHTTPJSON(w, map[string]bool{"ok": true})
	})

	mux.HandleFunc("/api/job", func(w http.ResponseWriter, r *http.Request) {
		writeHTTPJSON(w, job.snapshot())
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("無法啟動本機服務: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	log.Printf("LiveMines RTP 模擬器: %s", url)
	log.Printf("關閉此視窗即可結束程式")

	go func() {
		time.Sleep(300 * time.Millisecond)
		if err := openBrowser(url); err != nil {
			log.Printf("無法自動開啟瀏覽器，請手動開啟: %s", url)
		}
	}()

	if err := http.Serve(ln, mux); err != nil {
		log.Fatalf("HTTP 服務結束: %v", err)
	}
}

func bundleInfo(bundle *AppBundle, err error) bundleInfoResp {
	if err != nil {
		return bundleInfoResp{Error: err.Error()}
	}
	return bundleInfoResp{
		Dir:     bundle.Dir,
		CSVPath: bundle.CSVPath,
		CSVRows: bundle.CSVRows,
	}
}

func writeHTTPJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func writeHTTPError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}
