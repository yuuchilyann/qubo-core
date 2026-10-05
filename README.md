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
| [`docs/PYTHON_EXPORT.md`](docs/PYTHON_EXPORT.md) | 兩層產碼、與 `derive.ts` 的同步義務、sampler 目錄 |

## 內容

```
src/
├─ types.ts            # ConstrainedModel / QuboModel / SampleSet — 契約
├─ qubo.ts             # QuboBuilder、對稱↔上三角、slack 二進位展開
├─ derive.ts           # 通用推導引擎（全案唯一入口）
├─ cases/              # 參考案例集（含對照矩陣）與自訂輸入重建
├─ samplers/           # bruteForce（精確）、tabu（啟發式）
├─ python/             # emit / module / samplers / serialize
└─ verify/harness.ts   # 對帳邏輯
```

**零第三方 runtime 相依。**`vite` 與 `typescript` 只是 devDependency，
前者供驗證腳本在 Node 裡直接載入 TypeScript 原始碼。

## 核心設計決策

> **Q 矩陣一律用程式從原始約束模型推導，絕不硬寫。**

參考來源印出的 Q 另存一份（`paperQ`），只用來做 diff。比對通過時證明的是**通用配方本身正確**，
而不是「那些矩陣抄對了」，因為每個案例走的都是同一支 `derive()`。

## 三道驗證

```bash
npm run verify:all
```

| 指令 | 檢查什麼 |
|---|---|
| `npm run verify` | 推導的 Q == 對照矩陣（逐格）、加性常數、窮舉最優解 == 對照解、`yOriginal = yQubo + constant`、最優解代回原始約束全部滿足。外加 tabu 回歸守衛 |
| `npm run verify:python` | 內嵌的 Python `build_qubo()` == TypeScript `derive()` == 對照矩陣。**三方一致** |
| `npm run verify:emit` | 把產出的 Python **原封不動執行**，確認每個案例的兩層產碼都印出預期的答案 |

`verify:python` 與 `verify:emit` 需要 `python` 在 PATH 上（純 stdlib，不需安裝任何套件）；
沒有的話會 SKIP 而非誤報通過。

## ⚠️ 唯一的同步義務

`src/python/module.ts` 的 `FUNCTION_MODULE` 是一段內嵌的 Python，
它是 `src/derive.ts` 與 `src/qubo.ts` 的**逐行移植**。

**改動 TypeScript 端的推導時，必須同步更新這段 Python。**
這是全庫唯一有同一個演算法存在兩份的地方，也因此是唯一會靜默漂移的地方。
`verify:python` 是它的守衛。

## 消費方式

以 git dependency 釘 tag：

```json
{ "dependencies": { "qubo-core": "github:yuuchilyann/qubo-core#v0.6.0" } }
```

| tag | 內容 |
|---|---|
| `v0.1.0` | 初版 |
| `v0.2.0` | `deriveModel(model, P)`，可從任意約束模型推導，不限目錄內的案例 |
| `v0.3.0` | 產碼器泛化：`EmitContext` + `emitTier1For` / `emitTier2For`；`toPythonModel` 改吃模型 |
| `v0.4.0` | `MockDWaveSampler`（真實 minor-embedding，不需 token）；`verify:emit` 從 22 支程式擴充到 66 支。`SamplerLimitKey` 新增 `sampler.limit.mock`，升版的消費端要補這個字典項目 |
| `v0.5.0` | **延伸案例**：論文只點名、沒有算例的問題（`ExtendedCase`，首例 Max Independent Set）。新增 `solveConstrained()`（不經 QUBO、直接窮舉原始約束模型），十一個論文案例也多一道這個檢查。`ALL_CASES` 維持只收論文算例；全目錄改用 `CATALOG`，`findCase` / `casesInGroup` 回傳 `CatalogCase`，消費端要先以 `source` 收窄才能讀 `paperQ` |
| `v0.6.0` | 延伸案例增加到十一個，皆不需改引擎：Max Clique（可自訂圖）、Max Diversity、Discrete Tomography、Task Allocation、Capital Budgeting、Multiple Knapsack、P-Median、Warehouse Location、Linear Ordering、Clique Partitioning。新增 helper `labelledGrid`、`nonEdges` 與各案例的資料常數匯出 |

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
