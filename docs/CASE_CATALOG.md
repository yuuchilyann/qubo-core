# 案例目錄

參考案例集的資料與勾稽狀態。全部由 `npm run verify` 逐項檢查。

每個案例另外帶一段**情境**（做什麼用的、`x` 代表什麼、真實應用），存在 i18n 字典裡
而不是案例定義裡：那是簡報文案，不是勾稽資料，不該和 `paperQ` 放在同一個檔案。
對照表見下。

## 資料模型

每個案例宣告的是**原始約束模型**與論文套用的懲罰規則，Q 由 `derive()` 算出來。
論文印出的 Q 另存 `paperQ`，只用來做 diff。

```ts
type QuboCase = {          // 論文算例；ALL_CASES 只收這種
  source: 'worked'
  section: string          // '§5.2'
  pages: [number, number]  // 勾稽錨點
  model: ConstrainedModel  // 目標式 + 約束 + 每條約束用哪個懲罰配方
  penalty: { paperValue, min, max, step } | null
  paperQ: number[][]       // 只用於比對，永不參與計算
  paperConstant: number
  paperSolution: { x, yQubo, yOriginal }
}
```

`yOriginal = yQubo + constant` 這個不變式對每個案例都成立，也被 harness 斷言；
論文本身就是成對引用這兩個值的（例如 §5.4：「Solving QUBO gives y = −982 … we get
the original objective function value of 1200 − 982 = 218」）。

另一種是 `ExtendedCase`（`source: 'mentioned'`），給論文**只點名、沒有算例**的問題，
見下方「延伸案例」。它刻意**沒有** `paperQ`。兩者合稱 `CatalogCase`，完整目錄是
`CATALOG = [...ALL_CASES, ...EXTENDED_CASES]`。

`ALL_CASES` 維持只收論文算例，因為下游消費端會逐一讀它的 `paperQ`。

## 懲罰配方

| `method` | 對應 | 公式 |
|---|---|---|
| `transform1` | §5 通用配方 | `P(a·x − b)²`（需先用 slack 補成等式） |
| `transform2` | §5 特例 | `Σ_{j∈S} x_j ≤ 1` → `P Σ_{i<j∈S} xᵢxⱼ`（p.10 表格第 1、5 列） |
| `atLeastOne` | p.10 第 2 列 | `xᵢ + xⱼ ≥ 1` → `P(1 − xᵢ − xⱼ + xᵢxⱼ)` |
| `exactlyOne2` | p.10 第 3 列 | `xᵢ + xⱼ = 1` → `P(1 − xᵢ − xⱼ + 2xᵢxⱼ)` |
| `implication` | p.10 第 4 列 | `xᵢ ≤ xⱼ` → `P(xᵢ − xᵢxⱼ)` |
| `equal2` | p.10 第 6 列 | `xᵢ = xⱼ` → `P(xᵢ + xⱼ − 2xᵢxⱼ)` |

最小化時懲罰**相加**，最大化時**相減**（§5.3、§5.5）。

## 各案例

| § | id | n | P | 常數 | xᵀQx | 原始 y | 用到的配方 |
|---|---|---|---|---|---|---|---|
| 2 | `hello-world` | 4 | — | 0 | −11 | −11 | 無（自然形式） |
| 3.1 | `number-partitioning` | 8 | 1 | 6889 | −6889 | 0 | `transform1` |
| 3.2 | `max-cut` | 5 | — | 0 | 5 | 5 | 無（`cutEdges`） |
| 4.1 | `min-vertex-cover` | 5 | 8 | 48 | −45 | 3 | `atLeastOne` ×6 |
| 4.2 | `set-packing` | 4 | 6 | 0 | 2 | 2 | `transform2` ×2 |
| 4.3 | `max-2-sat` | 4 | 1 | 3 | −2 | 1 | 子句懲罰 ×12 |
| 5.1 | `set-partitioning` | 6 | 10 | 40 | −34 | 6 | `transform1` ×4 |
| 5.2 | `graph-coloring` | 15 | 4 | 20 | −20 | 0 | `transform1` ×5 + `transform2` ×21 |
| 5.3 | `general-01` | 10 | 10 | −900 | 916 | 16 | `transform1` ×3 + slack |
| 5.4 | `qap` | 9 | 200 | 1200 | −982 | 218 | `transform1` ×6 |
| 5.5 | `quadratic-knapsack` | 6 | 10 | −2560 | 2588 | 28 | `transform1` ×1 + slack |

第 7 道檢查「約束窮舉 == 論文原始 y」對十一案例全部成立：`solveConstrained()` 不經
QUBO，直接列舉原始決策變數、丟掉不可行的、用原始目標式計分。它和 `derive()` 沒有任何
共用程式碼，所以能抓到「推導配方在每個案例都錯得一樣」這種 diff 抓不到的錯誤。

§3.1 能通過是因為該實例恰好可以完美平分：平衡式在模型裡被宣告成硬性等式。

## 延伸案例（論文只點名的問題）

論文 §1（pp.3–4）列了二十多種「QUBO 涵蓋的問題」，§6 也提到幾種，但只有 §2–§5.5
這十一個有算例。其餘的問題論文**沒有給實例、沒有印 Q、也沒有答案**。

延伸案例的實例是本庫自己選的，所以沒有東西可以 diff。替代的參照是**約束窮舉**，
它不經過 `derive()`。`verifyExtended()` 斷言：

| 檢查 | 證明什麼 |
|---|---|
| 原始模型有可行解 | 實例本身有答案 |
| QUBO 最優 + 常數 == 約束窮舉最優 | 推導正確，且懲罰把最優值留在可行解上 |
| 每個 QUBO 最優解都可行 | P 夠大：沒有不可行解與最優值打平 |
| QUBO 簡併度 == 約束窮舉簡併度（無 slack 時） | 兩邊的最優解一一對應 |
| 約束窮舉最優 == `anchor`（若有） | 把實例接回論文**有**印出的某個數字 |

**不要從自己的輸出產生 `paperQ` 填進去**：那會讓檢查變成 `derive()` 和自己比對。

選實例時盡量沿用論文已有的資料，才能設 `anchor`。

| 點名處 | id | n | P（本庫選） | 常數 | 最優 | `anchor` 依據 | 配方 |
|---|---|---|---|---|---|---|---|
| §1 p.4、§6 p.34 | `max-independent-set` | 5 | 2 | 0 | 2 | 補集是頂點覆蓋（Gallai）：5 − §4.1 的 3 | `transform2` ×6 |

### Max Independent Set — 同一張圖，答案由 §4.1 推得

沿用 §3.2／§4.1 的 5 點圖。每條邊 `xᵢ + xⱼ ≤ 1` 是 p.10 表格第 1 列，也就是 §4.2 用的
`P·xᵢxⱼ`，p.10 說 Pardalos & Xue 把它用在 maximum clique「and related problems」。

獨立集的補集恰好是頂點覆蓋，所以 α(G) = n − τ(G) = 5 − 3 = 2，其中 3 是 §4.1 印出的
答案。論文沒寫這個 2，但它由論文印出的數字推得，這就是 `anchor`。

P 由本庫決定：同時選一條邊的兩端，目標 +1、懲罰 −P，所以 `P > 1` 才保證嚴格較差。
`P = 1` 時有 3 個不可行解與最優值打平（簡併度 7 而非 4），harness 的負面測試會抓到；
滑桿可以讓讀者親眼看到這件事。

## 值得注意的幾點

### §3.1 Number Partitioning — 「自然形式」其實是通用配方的特例

論文從 `diff²` 手推，本站表達成 `transform1` 套在平衡等式 `Σsⱼxⱼ = c/2` 上、`P = 1`。
展開後對角線是 `sⱼ² − c·sⱼ = sⱼ(sⱼ − c)`、非對角線是 `sᵢsⱼ`，與 p.7 印出的完全一致。

### §4.3 Max 2-SAT — 唯一有 ±½ 的 Q

子句 `(l₁ ∨ l₂)` 只有在兩個 literal 都為假時才違反，所以懲罰是兩個「為假」指示函數
的乘積：`x_v` 為假 ⇒ `(1 − x_v)`、`¬x_v` 為假 ⇒ `x_v`。展開這個乘積會自動生出 p.15
表格的全部三種情形，不需要 case 分析。

`−x₂x₃` 這種孤立的二次項在對稱形式下要對半拆到兩格，所以出現 ∓½。切到上三角形式就
變回整數。

### §5.2 Graph Colouring — 唯一同時用兩種變換

節點指派方程用 `transform1`，相鄰限制用 `transform2`。Q 的區塊對角結構（五個 3×3）
在熱圖上一眼可見，正是論文 p.23 說的「Looking for patterns is often a useful
de-bugging tool」。

沒有目標函數，任何正的 P 都可以。可行的 3-著色恰好有 6 種（節點 2 與其餘全鄰接，
剩下的路徑 1-5-4-3 用兩色只有 2 種著法，3 × 2 = 6）。

### §5.3 / §5.5 slack 上界是論文的判斷，不是推導

| 約束 | 論文取的上界 | 該列理論上限 |
|---|---|---|
| §5.3 `2x₁+2x₂+4x₃+3x₄+2x₅ ≤ 7` | 3 | 7 |
| §5.3 `3x₁+3x₂+2x₃+4x₄+4x₅ ≥ 5` | 6 | 11 |
| §5.5 `8x₁+6x₂+5x₃+3x₄ ≤ 16` | 3 | 16 |

論文原文是「estimating a reasonable value for how large the slack activity could be」
（p.25），所以 `slackBound` 在案例定義裡是**明寫的資料**而不是算出來的。
「建模推導」分頁會把兩個數字並列，讓讀者看見這個判斷。

二進位展開用單純的 2 的冪次：`k = ⌊log₂U⌋ + 1` 個位元，權重 1, 2, 4, …。
所以 `U = 6` 會得到 1+2+4（可達 7，略微超覆蓋），這正是論文 p.25 的做法。

### §5.4 QAP — 論文的目標函數式子有排版錯誤

p.28 印出的目標函數與 p.29 印出的 Q 矩陣互相矛盾：

| 論文式子 | 應為 | 依據 |
|---|---|---|
| `60x₂x₇` | `32x₂x₇` | Q[1][6] = 16 ⇒ 係數 32 |
| （遺漏） | `48x₅x₇` | Q[4][6] = 24 ⇒ 係數 48 |
| （遺漏） | `90x₆x₇` | Q[5][6] = 45 ⇒ 係數 90 |

窮舉所有「設施不同且位置不同」的配對會得到 **18** 個二次項，而非式子列出的 16 個。
本站從流量矩陣 F 與距離矩陣 D 重新推導（`x_{ik}·x_{jl}` 的係數是 `2·f_{ij}·d_{kl}`），
結果與論文印出的 **Q 矩陣**逐格相符，也重現論文自己的答案 218。

換句話說：Q 矩陣是對的，它上面那行式子有排版錯誤。這是「推導而非抄寫」的直接回報。

## 新增案例的步驟

### 論文算例

1. 在 `src/cases/` 對應的 group 檔裡加一個 `QuboCase`（`source: 'worked'`）
2. 填 `model`（原始約束模型）、`paperQ`、`paperConstant`、`paperSolution`
3. 加進 `src/cases/index.ts` 的 `ALL_CASES`
4. 在 `src/i18n/locales/zh.tsx` 加四個情境字串（`case.<id>.name` / `.scenario` /
   `.xMeans` / `.uses`），並在 `src/components/CaseScenario.tsx` 的 `SCENARIOS`
   註冊。鍵是明寫的，漏掉會是編譯錯誤而不是頁面上一行原始 key
5. `npm run verify:all` — 三道驗證都要綠

如果 `derive()` 算不出 `paperQ`，**先懷疑 `model` 宣告錯了**，不要去改 `paperQ`。
`paperQ` 是外部真值，不是可以調整到符合的參數。

### 延伸案例

1. 確認問題確實出現在論文裡（記下節與頁），並判斷它不是自有方法
2. 在 `src/cases/extended.ts` 加一個 `ExtendedCase`（`source: 'mentioned'`），
   `section` / `pages` 指向**點名處**；`group` 依所用的配方歸類
3. 實例盡量沿用論文已有的資料；能從論文數字推得最優值時填 `anchor`，並寫明推導
4. 在檔案註解裡寫明 P 為什麼這樣選（論文沒選）
5. 加進 `src/cases/index.ts` 的 `EXTENDED_CASES`
6. 站台端：情境字串、`SCENARIOS` 註冊，以及頁面上「論文只點名」的標示
7. `npm run verify:all`
