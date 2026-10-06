# qubo-core

QUBO 推導引擎、古典求解器與 Python 產碼器。

把約束最佳化模型轉成標準型 `min/max y = xᵀQx, x ∈ {0,1}ⁿ`，附上精確與啟發式兩種求解器，
以及可直接執行的 Python 匯出。從
[QUBOModelExplorer](https://github.com/yuuchilyann/QUBOModelExplorer) 抽出，
讓推導只有一份實作，前端各自釘版本消費。

## 這個庫收什麼

只收演算法與建模配方：推導、求解、產碼，以及驗證這些東西正確所需的參考資料。

**不收任何消費端的產品實作**：外部服務整合、使用者介面、i18n 字典、營運與計費邏輯，
都屬於使用這個庫的專案，不屬於這裡。判準是這條：

> 收：如果它是通用的建模或求解方法。
> 不收：如果它只對某一個前端有意義。

新增文獻中的最佳化方法沒有問題。**若要加入的是尚未公開的自有方法，先判斷是否適合公開，
不要預設進來。**

## 文件

| 文件 | 內容 |
|---|---|
| [`docs/CASE_CATALOG.md`](docs/CASE_CATALOG.md) | 參考案例集的資料與勾稽狀態；新增案例的步驟 |
| [`docs/COVERAGE.md`](docs/COVERAGE.md) | 論文提到的每個問題的收錄狀態；不收錄的項目與原因；收錄判準 |
| [`docs/PYTHON_EXPORT.md`](docs/PYTHON_EXPORT.md) | 兩層產碼、與 `derive.ts` 的同步義務、sampler 目錄 |
| [`docs/EMBEDDING.md`](docs/EMBEDDING.md) | 硬體嵌入：Pegasus 拓樸、嵌入啟發式、獨立檢查器、與 minorminer 的實測對照 |

## 內容

```
src/
├─ types.ts            # ConstrainedModel / QuboModel / SampleSet — 契約
├─ qubo.ts             # QuboBuilder、對稱↔上三角、slack 二進位展開
├─ derive.ts           # 通用推導引擎（全案唯一入口）
├─ reduce.ts           # 子句多項式展開與 Rosenberg 高次項降階（§7 第 4 點）
├─ constrained.ts      # 不經 QUBO、直接窮舉原始約束模型（延伸案例的參照）
├─ cases/              # natural / knownPenalty / general：論文 11 個算例（含對照矩陣）
│                      # extended：論文點名或引用、沒有算例的 20 個問題；mutate：自訂輸入重建
├─ samplers/           # bruteForce（精確）、tabu（啟發式）
├─ hardware/           # pegasus（移植 dwave_networkx）、problemGraph、embed（嵌入啟發式）、
│                      # checkEmbedding（獨立檢查器）
├─ python/             # emit / module / samplers / serialize
├─ random.ts           # 可重現的 PRNG（tabu 與 embed 共用）
└─ verify/             # harness（對帳）、hardware（拓樸與嵌入）
fixtures/              # dwave_networkx 產生的 Pegasus 參照（verify:embed 用）
```

**零第三方 runtime 相依。**`vite` 與 `typescript` 只是 devDependency，
前者供驗證腳本在 Node 裡直接載入 TypeScript 原始碼。

## 核心設計決策

> **Q 矩陣一律用程式從原始約束模型推導，絕不硬寫。**

參考來源印出的 Q 另存一份（`paperQ`），只用來做 diff。比對通過時證明的是**通用配方本身正確**，
而不是「那些矩陣抄對了」，因為每個案例走的都是同一支 `derive()`。

## 四道驗證

```bash
npm run verify:all
```

| 指令 | 檢查什麼 |
|---|---|
| `npm run verify` | **論文算例**：推導的 Q == 對照矩陣（逐格）、加性常數、窮舉最佳解 == 對照解、`yOriginal = yQubo + constant`、最佳解代回原始約束全部滿足、直接窮舉原始約束模型 == 對照解。**延伸案例**：QUBO 最佳 + 常數 == 約束窮舉最佳、每個 QUBO 最佳解都可行、簡併度一致（無 slack 時）、輔助變數等於其乘積、由論文數字推得的值（若有）。外加 tabu 回歸守衛 |
| `npm run verify:python` | 內嵌的 Python `build_qubo()` == TypeScript `derive()`，論文算例再 == 對照矩陣（**三方一致**；延伸案例沒有對照矩陣，為兩方一致） |
| `npm run verify:emit` | 把產出的 Python **原封不動執行**，確認每個案例 × 六種 tier／sampler 組合都印出參照答案（31 案例共 186 支程式） |
| `npm run verify:embed` | Pegasus 拓樸與 `dwave_networkx` 的 fixture 完全一致；嵌入檢查器擋得下每一種錯誤嵌入；31 個案例全部嵌入成功並通過檢查器 |

`verify:python` 與 `verify:emit` 需要 `python` 在 PATH 上（純 stdlib，不需安裝任何套件）；
沒有的話會 SKIP 而非誤報通過。`verify:embed` 不需要 Python。

另有 `npm run compare:minorminer`：把本庫的嵌入和 Ocean 的 minorminer 並排比較。
它需要安裝 Ocean，只供參考，**不在** `verify:all` 裡。

## ⚠️ 唯一的同步義務

`src/python/module.ts` 的 `FUNCTION_MODULE` 是一段內嵌的 Python，
它是 `src/derive.ts`、`src/reduce.ts` 與 `src/qubo.ts` 的**逐行移植**。
`reduce.ts` 的高次項降階連**處理順序**都要一致（先進先出、取最小的兩個索引），
否則輔助變數的編號會不同，Q 就對不上。

**改動 TypeScript 端的推導時，必須同步更新這段 Python。**
這是全庫唯一有同一個演算法存在兩份的地方，也因此是唯一會靜默漂移的地方。
`verify:python` 是它的守衛。

## 消費方式

以 git dependency 釘 tag：

```json
{ "dependencies": { "qubo-core": "github:yuuchilyann/qubo-core#v0.10.0" } }
```

| tag | 內容 |
|---|---|
| `v0.1.0` | 初版 |
| `v0.2.0` | `deriveModel(model, P)`，可從任意約束模型推導，不限目錄內的案例 |
| `v0.3.0` | 產碼器泛化：`EmitContext` + `emitTier1For` / `emitTier2For`；`toPythonModel` 改吃模型 |
| `v0.4.0` | `MockDWaveSampler`（真實 minor-embedding，不需 token）；`verify:emit` 從 22 支程式擴充到 66 支。`SamplerLimitKey` 新增 `sampler.limit.mock`，升版的消費端要補這個字典項目 |
| `v0.5.0` | **延伸案例**：論文只點名、沒有算例的問題（`ExtendedCase`，首例 Max Independent Set）。新增 `solveConstrained()`（不經 QUBO、直接窮舉原始約束模型），十一個論文案例也多一道這個檢查。`ALL_CASES` 維持只收論文算例；全目錄改用 `CATALOG`，`findCase` / `casesInGroup` 回傳 `CatalogCase`，消費端要先以 `source` 收窄才能讀 `paperQ` |
| `v0.6.0` | 延伸案例增加到十一個，皆不需改引擎：Max Clique（可自訂圖）、Max Diversity、Discrete Tomography、Task Allocation、Capital Budgeting、Multiple Knapsack、P-Median、Warehouse Location、Linear Ordering、Clique Partitioning。新增 helper `labelledGrid`、`nonEdges` 與各案例的資料常數匯出 |
| `v0.7.0` | **引擎擴充：高次項降階**（§7 第 4 點，Rosenberg）。子句可以有任意多個文字（`Clause` 由兩元組放寬為 `Literal[]`），三次以上的項以輔助變數降回二次。新增 `src/reduce.ts`（Python 端同步移植）、`VarMeta.kind` 新增 `'aux'`（附 `auxOf`）、`DerivationStep.kind` 新增 `'reduction'`、`Derivation.auxInfo`。新案例 Max 3-SAT、CSP（Not-All-Equal）。**行為變更**：子句是目標函數本身，權重固定為 1，不再乘上 P；P 在子句模型裡只用於降階懲罰。所有目錄內的 2-SAT 都在 P = 1 推導，Q 不變；對 `kind` 或 `step.kind` 做窮舉 switch 的消費端要補新成員 |
| `v0.8.0` | §6 引用的問題：Graph Partitioning、Portfolio、Max Weight Matching。`ExtendedCase` 新增選填欄位 `mention: 'listed' \| 'cited'`，區分 §1 清單與 §6 引用；產碼器與驗證輸出隨之區分 named／cited |
| `v0.9.0` | §6 引用的中型問題：Community Detection（模組度，Negre 等的形式）、Shortest Path（流量守恆）、Travelling Salesman（車輛路徑的單車核心）、Traffic Flow（照 Neukart 等的 QUBO 與 λ 規則）。皆不需改引擎 |
| `v0.10.0` | **硬體嵌入**（工具功能，不是案例，論文 p.33）：`hardware/pegasus`（`dwave_networkx` 的 Pegasus 拓樸與版面，以 fixture 驗證）、`hardware/problemGraph`、`hardware/embed`（簡化的 minorminer 啟發式，可重現、有工作量上限）、`hardware/checkEmbedding`（獨立檢查器）。新增 `verify:embed`（併入 `verify:all`）與 `compare:minorminer`。PRNG 抽成 `random.ts`，tabu 結果不變。既有 API 無變更 |

沒有 build 步驟：原始碼以 TypeScript 出貨，因為消費端都是 bundler 環境，
而且這樣驗證腳本檢查的就是前端實際載入的那些模組，不是它們的編譯副本。

核心穩定時打 tag，下游主動升版並跑自己的回歸。兩邊節奏獨立，但只有一份 `derive()`。

> 重新釘 tag 之後 `npm install` 不會換版：lockfile 鎖著舊 commit SHA，
> 必須用 `npm install github:yuuchilyann/qubo-core#vX.Y.Z` 明確指定。

### 給消費者的型別約束

`python/samplers.ts` 匯出 `SamplerLimitKey`，是各 sampler 規模上限的字典鍵聯集。
有 i18n 的消費者應斷言自己的字典涵蓋它，以保留「鍵打錯就編譯失敗」的保證：

```ts
type _CoversSamplerKeys = SamplerLimitKey extends TKey ? true : never;
const _check: _CoversSamplerKeys = true;
```

相依方向刻意如此：核心定義契約，UI 滿足它。反過來會讓核心綁死在某一份字典上。
