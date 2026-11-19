# card2vcf quickstart — Windows PowerShell

Use two PowerShell windows. Keep both open while processing cards. No API key is required for this local-only setup.

## First-time dependency setup

Run once, and again after dependency updates:

```powershell
cd D:\Dev\monica\card2vcf
npm.cmd ci --ignore-scripts
```

Node.js 22 or newer and your installed `llama` command are required. The model files below must already exist.

## Window 1 — start the llama model server

```powershell
llama serve `
  -m "D:\AI\models\Qwen3.8-27B-UD-Q4_K_M.gguf" `
  --mmproj "D:\AI\models\mmproj-BF16.gguf" `
  --device Vulkan1 `
  --n-gpu-layers auto `
  --ctx-size 8192 `
  --parallel 1 `
  --cache-ram 0 `
  --batch-size 512 `
  --ubatch-size 128 `
  --reasoning off `
  --host 127.0.0.1 `
  --port 9931 `
  --alias qwen3.8-27b `
  --no-webui
```

Wait for `model loaded` and `listening on http://127.0.0.1:9931`.

The backtick must be the last character on each continued line, with no trailing spaces.

Settings used here:

- `Vulkan1` selects this PC's RTX 5060 Laptop GPU. Run `llama serve --list-devices` to confirm device names if the hardware or installation changes.
- `--n-gpu-layers auto` fits as much as possible in GPU memory. This 27B model exceeds the GPU's 8 GiB VRAM, so some CPU work and slow extraction are expected.
- `--parallel 1` serves one request at a time, matching the app's sequential queue.
- `--cache-ram 0` disables the extra RAM prompt cache. Model weights and active context buffers remain loaded; this does not unload the model or free all memory after each card.
- `--batch-size 512 --ubatch-size 128` processes prompts in smaller chunks to reduce peak working memory. This can trade some processing speed for lower memory use. These settings do not reduce image resolution or change the model.
- `--ctx-size 8192` sets the model context budget; `--reasoning off` disables thinking mode.
- `--host 127.0.0.1` limits network access to this PC. There is no API-key argument.
- The alias and port match card2vcf's defaults. Changing them requires matching app configuration.

## Window 2 — start card2vcf

```powershell
cd D:\Dev\monica\card2vcf
npm.cmd start
```

Open **http://127.0.0.1:8765** in Edge or Chrome. Click **Check model** and look for **Model reachable**. The check does not send card data and does not guarantee OCR accuracy.

For the Simplified Chinese interface, see [card2vcf interface language](../docs/IMPLEMENTATION.md#card2vcf-interface-language).

Select your images, extract, review, then export. The default extraction timeout is five minutes per card; Cancel remains available.

See the [export format and job selection rules](SPEC.md#amendment-to-primary-job-selection-and-export-defaults) for modified and stock Monica.

If you previously configured an API key but now run llama without one, clear it in the app's PowerShell window before starting:

```powershell
Remove-Item Env:CARD2VCF_API_KEY -ErrorAction SilentlyContinue
npm.cmd start
```

## Stop and restart

- Stop either service with **Ctrl+C** in its PowerShell window.
- To change only llama flags: finish or cancel extraction, stop llama with Ctrl+C, and restart it with the command above. Keep card2vcf and its browser tab open; no npm restart or webpage refresh is needed. Once llama is ready, click Check model before extracting again.
- If both services need restarting, start llama first and wait until ready, then start card2vcf.
- Export any reviewed work before refreshing the webpage. Closing or refreshing discards all in-memory session data; downloaded VCF/ZIP files remain.
- After a refresh, click Check model before starting extraction.

## Optional API key

Only if you want authentication, add `--api-key YOUR_LOCAL_KEY` to the llama command. In the card2vcf window, supply the same key before starting:

```powershell
$env:CARD2VCF_API_KEY = 'your-local-key'
npm.cmd start
```

Keep real keys out of source files, screenshots, and shared logs. See [configuration names](../docs/IMPLEMENTATION.md#configuration) for app settings and [README.md](README.md) for the documentation index.
