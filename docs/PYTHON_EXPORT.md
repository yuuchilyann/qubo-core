# Python 匯出

把案例的 QUBO 匯出成可在本機 / Jupyter / Google Colab 執行的 Python。分兩層交付，
對應論文自己的兩個抽象層級。

## 1. 第一層「這一題」

`emitTier1()`。Q 以字面值寫進程式碼，直接建 BQM 並呼叫 sampler。

```python
N = 6
SENSE = "min"
OFFSET = 40  # additive constant dropped during the recast

Q = {
    (0, 0): -17, (0, 1): 20, (0, 2): 20, ...
}

qubo = Q if SENSE == "min" else {k: -v for k, v in Q.items()}
bqm = dimod.BinaryQuadraticModel.from_qubo(qubo)
```

三個容易寫錯的地方，都由產碼器處理掉：

- **上三角轉換**。`xᵀQx = Σ qᵢᵢxᵢ + Σ_{i<j} 2qᵢⱼxᵢxⱼ`，所以交給 `dimod` 的非對角
  係數是 `2qᵢⱼ`，不是 `qᵢⱼ`。
- **最大化的符號**。`dimod` 一律最小化，所以最大化問題送出前整份取負，回報時再翻回來。
- **加性常數**。QUBO 值與原始目標值差一個常數：`y_original = xᵀQx + OFFSET`。

這一層**沒有漂移風險**：數字來自頁面上顯示的同一份 `derive()` 結果。

## 2. 第二層「建模函式版」

`emitTier2()`。附上 `build_qubo()`，把原始約束模型當資料丟進去，在 Python 裡自己
推出 Q。這才是論文真正在教的東西：換一個模型，同一支函式照樣能用。

```python
MODEL = {
    "sense": "min",
    "num_vars": 6,
    "linear": [3, 2, 1, 1, 3, 2],
    "quadratic": [],
    "constraints": [
        {"coeffs": [1, 0, 1, 0, 0, 1], "rel": "=", "rhs": 1, "method": "transform1"},
        ...
    ],
}

Q_sym, OFFSET, N = build_qubo(MODEL, P=10)
Q = to_qubo_dict(Q_sym)
```

## ⚠️ 與 `derive.ts` 的同步約束（重要）

`src/python/module.ts` 的 `FUNCTION_MODULE` 是一段以 `String.raw` 內嵌的 Python，
它是下列 TypeScript 的**逐行移植**：

- `src/derive.ts` — `derive` / `expandSlack` / `addClausePenalty`
- `src/qubo.ts` — `QuboBuilder.addSquaredLinear` / `slackWeights` / `autoSlackBound`

**改動 TypeScript 端的推導時，必須同步更新這段 Python**，否則第二層會與 app 說不同的話。

這是全案唯一有同一個演算法存在兩份的地方，也因此是唯一會靜默漂移的地方。

### 驗證等價性

```bash
npm run verify:python
```

抽出真正的 `FUNCTION_MODULE`（不是複本），用系統 `python` 執行，餵進 app 所出貨的
同樣的模型集合，斷言三方一致：

```
Python build_qubo()  ==  TypeScript derive()  ==  論文印出的 Q
```

模型的序列化走 `src/python/serialize.ts` 的 `toPythonModel()`，**與產碼器共用**，
所以驗證的是使用者實際複製到的那串 bytes，不是一份剛好目前一致的平行表示。

> `String.raw` 的坑：Python docstring 裡不要用反引號（markdown 習慣），會提前終止
> 模板字面值。

## 3. 產出的程式碼真的會跑嗎

```bash
npm run verify:emit
```

把產出的 Python **原封不動執行**，確認每個案例的兩層產碼都印出預期的答案。

不需要安裝任何套件：腳本注入純 stdlib 的樁模組，冒充 `dimod`、`dwave.samplers` 與
`dwave.system`，所以不會動到使用者的 Python 環境。

**每一個不需要 token 的 sampler 都會被實際執行**，而不是只跑 `ExactSolver`。理由是
它們各自產生**不同的程式**：不同的 import、不同的建構式，而 `mock` 那一支還是一個
包住另一個 sampler 的 composite。產碼器的錯誤正好會藏在這些差異裡。
二十二個案例（十一個論文算例＋十一個延伸案例）× 六種 tier／sampler 組合，共 132 支程式。
延伸案例沒有論文答案，比對的是 `solveConstrained()` 窮舉原始約束模型得到的最優值，
產出的程式在預期答案的註解裡也是這樣標示來源。

這一道檢查的是**只存在於產碼器裡**的邏輯：上三角轉換、最大化符號翻轉、加性常數還原、
變數索引對應。前兩道驗證都抓不到這些。

> **綠燈代表什麼、不代表什麼。**樁裡每一個 sampler 都是同一個窮舉求解器換個名字，
> 這是刻意的。它證明的是**程式**：import 解得開、建構式形狀正確、`sample()` 收得下
> 那些關鍵字、符號與常數與索引都對。它**不**證明模擬退火會找到論文的答案：
> 那是關於 sampler 的宣稱，只有跑真的才算數。

## Sampler 目錄

`src/python/samplers.ts`。分兩區的理由是教學上的：

| Sampler | 套件 | 需要 token | 規模 |
|---|---|---|---|
| `dimod.ExactSolver` | `dimod` | ✗ | ≤ 約 20 變數，保證最優 |
| `TabuSampler` | `dwave-samplers` | ✗ | 數千變數 |
| `SimulatedAnnealingSampler` | `dwave-samplers` | ✗ | 數千變數 |
| `MockDWaveSampler` + `EmbeddingComposite` | `dwave-system` | ✗ | 受 minor-embedding 限制 |
| `DWaveSampler` + `EmbeddingComposite` | `dwave-ocean-sdk` | ✓ | 受 minor-embedding 限制 |
| `LeapHybridSampler` | `dwave-ocean-sdk` | ✓ | 數萬變數 |

參考案例集最大 15 變數，都在 `ExactSolver` 射程內，所以無需 token 的四個選項
產出的程式碼是**真的能跑並得到論文答案**的，不是示意用的。

**`mock` 是其中最有意思的一個。**`MockDWaveSampler` 提供的是真實的求解器拓樸，
所以 `EmbeddingComposite` 會做**真正的 minor-embedding**，chains 是真的 chains，
被模擬的只有退火本身。它支持的宣稱是「embedding 這條路已完整實作並實際執行」，
而不是「在量子退火機上求解」。換成 `qpu` 那一列是換一組憑證，不是改程式。

## 安裝指令

`InstallBlock` 提供 pip / conda / uv 三選一。兩個刻意的決定：

- **不用 `[extras]` 方括號語法**。方括號在 zsh 與 PowerShell 是萬用字元，需要分 shell
  引號；明確列出套件名則 cmd / PowerShell / bash / zsh 通用。
- **conda 用 meta-package `dwave-ocean-sdk`**。conda-forge 上有它的正式 feedstock，
  而細分的 `dwave-samplers` 不保證有。pip / uv 則走最小集合。

Shell 的安裝指令與 Notebook 第一個 cell 的 `!pip install` **不共用字串**，前者是
shell，後者需要 `!` 前綴。

## Notebook / Colab

`buildNotebook()` 產生 cell 陣列，`buildIpynb()` 序列化成可上傳的 `.ipynb`。
第一個 cell 是安裝，需要 token 的 sampler 會多一個設定 `DWAVE_API_TOKEN` 的 cell。

交付方式是**下載 `.ipynb` → Colab「檔案 → 上傳筆記本」**。零額外基礎建設、零漂移。

> 未來若要加「Open in Colab」徽章（`colab.research.google.com/github/...`），
> 建議在 build 階段用同一支 generator 把 notebook 產進 repo，維持同源，
> 而不是手動維護一份副本。
