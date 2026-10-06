# 硬體嵌入（minor embedding）

把一個 QUBO 放上 D-Wave 的 Pegasus 晶片：每個變數分到一條 **chain**（一組相連的實體 qubit），
讓 QUBO 需要的每個變數對，都落在兩條 chain 之間一條真實的 coupler 上。

論文 p.33 只用一句話帶過這件事：QUBO 必須先嵌入（編譯）到量子硬體上，
而這本身就是一個很難的問題（引用 Date 等，2019）。論文沒有畫圖也沒有算例，
所以這個模組是本庫的**工具功能**，不是案例；它不改變任何案例的 Q。

## 模組

```
src/hardware/
├─ pegasus.ts          # pegasusGraph(m)、pegasusLayout(g)：移植 dwave_networkx
├─ problemGraph.ts     # problemGraph(Q)：QUBO → 問題圖；density(g)
├─ embed.ts            # findEmbedding(source, target)、findPegasusEmbedding(source)
│                      # embeddingStats、chainCouplers、intraChainCouplers
└─ checkEmbedding.ts   # 獨立檢查器，不 import embed.ts
```

```ts
import { derive } from 'qubo-core/derive';
import { problemGraph } from 'qubo-core/hardware/problemGraph';
import { findPegasusEmbedding } from 'qubo-core/hardware/embed';
import { checkEmbedding } from 'qubo-core/hardware/checkEmbedding';

const source = problemGraph(derive(qcase).model.Q);
const { m, target, result } = findPegasusEmbedding(source);   // 從 P(2) 往上試
if (result.ok) checkEmbedding(source, target, result.chains); // { ok, problems }
```

`result.chains[i]` 是變數 i 用到的 qubit 編號。編號與 `dwave_networkx` 的線性索引相同，
所以這裡印出的 chain，和 Ocean 印出的 chain 指的是同一組 qubit。

## 硬體：理想的 Pegasus 片段

`pegasusGraph(m)` 是 `dwave_networkx.pegasus_graph(m)` 在預設參數下的逐行移植
（`fabric_only=True`、`offsets_index=0`、整數標籤）；`pegasusLayout` 移植 `pegasus_layout`，
畫出來的樣子和 D-Wave 文件裡的 Pegasus 圖相同。

| P(m) | qubit | coupler | 備註 |
|---|---|---|---|
| P(2) | 40 | 164 | |
| P(3) | 128 | 704 | |
| P(4) | 264 | 1,604 | |
| P(6) | 680 | 4,484 | |
| P(16) | 5,640 | — | Advantage 的完整規模；本庫不使用 |

這是**理想圖**：設計上應有的全部 qubit 與 coupler。真實 QPU 的 *working graph* 是它的子圖，
扣掉製造時壞掉的元件，每台機器、每段時間都不一樣，要用 Leap 帳號才讀得到
（例如 `DWaveSampler().edgelist`）。

## 問題圖

`problemGraph(Q)` 的邊是 `i < j` 且 `Q[i][j] + Q[j][i] ≠ 0`：

- 兩半相加，所以 Q 存成對稱或上三角都一樣。
- 精確判斷 `≠ 0`。本庫推導的 Q 只由整數與二分之一組成，抵消是精確的；
  CSP 的三次項兩兩抵消後，就真的不需要 coupler。
- 對角線是一次項，只落在單一 qubit 上，不產生邊。沒有邊的變數仍然需要一顆自己的 qubit。

## 演算法

`findEmbedding` 是 Ocean `minorminer` 背後那套啟發式的簡化版
（Cai, Macready & Roy 2014, *A practical heuristic for finding graph minors*, arXiv:1406.2741）。
放置一個變數時：

1. 從每個已放好的鄰居 chain 出發，在硬體上做一次以 qubit 為權重的最短路徑搜尋：
   空的 qubit 成本 1，已被 k 條 chain 使用的成本 α^k。
2. 取距離總和最小的 qubit 當根。**根的權重對每個鄰居都計一次**。
3. 由根往每個鄰居長出路徑，最遠的先長；後面的路徑把 chain 自己的 qubit 視為免費，
   所以會從主幹分岔，而不是並排另走一條。
4. 修掉多餘的葉節點：拿掉之後所有鄰居仍然碰得到，就拿掉。

外層：搜尋過程允許 chain 重疊。每一輪把所有變數拆掉重放，α 逐輪加倍，直到沒有 qubit
被共用。重疊數停滯時就「踢」一次：把壓在共用 qubit 上的 chain，加上其餘 chain 隨機的一半，
**一起**拆掉再重放，然後重新開始 α 的排程。找到合法嵌入之後，縮短回合用同樣的方式，
拆掉最長的 chain（加上其餘隨機一半）、重新分開，保留「最長 chain 最短、其次總 qubit 最少」
的合法結果。

### 開發時踩過的三個坑

這三點都會讓演算法看起來正常運作，結果卻差很多，所以記下來：

| 寫法 | 後果 |
|---|---|
| 根的權重只計一次 | 根放在別的 chain 上幾乎不用成本，所有 chain 擠在少數幾顆共用 qubit 上，永遠分不開。K₁₀ 在 P(2) 上 12 顆 qubit 就凍結 |
| 踢的時候一條一條拆、一條一條放 | 每條被拆的 chain 是在其他 chain 都還在的情況下重放，最好的位置就是它剛離開的那個，什麼都沒變。縮短回合的分數一輪都沒動過 |
| 只踢壓在共用 qubit 上的 chain | 其餘 chain 都不動，它們原封不動地放回原處；分離階段卡在同一個狀態直到用完預算 |

### 工作量預算

每次呼叫有工作量上限 `budget`，單位是「最短路徑搜尋掃過的 qubit 數」，預設
`DEFAULT_EMBED_BUDGET = 4e6`；`findPegasusEmbedding` 對所有嘗試的大小另有總上限
`DEFAULT_PEGASUS_BUDGET = 1e7`。用工作量而不用時間，是為了**同一個 QUBO 在快的機器和慢的
機器上得到同一張圖**。目錄裡最重的案例約用 3.1M，預算不會改變任何案例的結果；
找不到的情況則在每個大小約 2～3 秒（Node）內放棄，不會跑上一分鐘。

## 實測

### 目錄的 31 個案例

`npm run verify:embed`，預設輸入與預設 P，取第一個成功的 P(m)。全部通過 `checkEmbedding`。
「mm」欄是 `npm run compare:minorminer` 的結果：minorminer 在**同一個**片段上取 5 個 seed 的最好值。

| § | 案例 | n | 邊 | 密度 | P(m) | qubit（本庫／mm） | 最長 chain（本庫／mm） |
|---|---|---|---|---|---|---|---|
| §2 | hello-world | 4 | 4 | 0.67 | P(2) | 4／4 | 1／1 |
| §3.1 | number-partitioning | 8 | 28 | 1.00 | P(2) | 12／12 | 2／2 |
| §3.2 | max-cut | 5 | 6 | 0.60 | P(2) | 5／5 | 1／1 |
| §4.1 | min-vertex-cover | 5 | 6 | 0.60 | P(2) | 5／5 | 1／1 |
| §4.2 | set-packing | 4 | 4 | 0.67 | P(2) | 4／4 | 1／1 |
| §4.3 | max-2-sat | 4 | 3 | 0.50 | P(2) | 4／4 | 1／1 |
| §5.1 | set-partitioning | 6 | 14 | 0.93 | P(2) | 8／8 | 2／2 |
| §5.2 | graph-coloring | 15 | 36 | 0.34 | P(2) | 23／19 | 2／2 |
| §5.3 | general-01 | 10 | 39 | 0.87 | P(2) | 16／15 | 2／2 |
| §5.4 | qap | 9 | 36 | 1.00 | P(2) | 14／14 | 2／2 |
| §5.5 | quadratic-knapsack | 6 | 15 | 1.00 | P(2) | 8／8 | 2／2 |
| §1 | max-independent-set | 5 | 6 | 0.60 | P(2) | 5／5 | 1／1 |
| §1 | max-clique | 5 | 4 | 0.40 | P(2) | 5／5 | 1／1 |
| §1 | max-diversity | 8 | 28 | 1.00 | P(2) | 12／12 | 2／2 |
| §1 | discrete-tomography | 9 | 18 | 0.50 | P(2) | 11／11 | 2／2 |
| §1 | task-allocation | 6 | 9 | 0.60 | P(2) | 6／6 | 1／1 |
| §1 | capital-budgeting | 13 | 58 | 0.74 | P(2) | 22／18 | 2／2 |
| §1 | multiple-knapsack | 16 | 60 | 0.50 | P(3) | 24／24 | 2／2 |
| §1 | p-median | 15 | 27 | 0.26 | P(2) | 15／15 | 1／1 |
| §1 | warehouse-location | 15 | 24 | 0.23 | P(2) | 16／15 | 2／1 |
| §1 | linear-ordering | 14 | 36 | 0.40 | P(2) | 20／18 | 2／2 |
| §1 | clique-partitioning | 16 | 48 | 0.40 | P(3) | 31／26 | 3／2 |
| §1 | max-3-sat | 5 | 7 | 0.70 | P(2) | 5／5 | 1／1 |
| §1 | constraint-satisfaction | 6 | 15 | 1.00 | P(2) | 8／8 | 2／2 |
| §6 | graph-partitioning | 5 | 10 | 1.00 | P(2) | 6／6 | 2／2 |
| §6 | portfolio | 5 | 10 | 1.00 | P(2) | 6／6 | 2／2 |
| §6 | max-matching | 6 | 9 | 0.60 | P(2) | 6／6 | 1／1 |
| §6 | community-detection | 12 | 36 | 0.55 | P(2) | 16／16 | 2／2 |
| §6 | shortest-path | 7 | 14 | 0.67 | P(2) | 8／8 | 2／2 |
| §6 | travelling-salesman | 9 | 30 | 0.83 | P(2) | 13／12 | 2／2 |
| §6 | traffic-flow | 9 | 18 | 0.50 | P(2) | 11／10 | 2／2 |

最長 chain 與 minorminer 相同的有 29 個；總 qubit 最多多 5 顆。

### 全連通圖 Kₙ：容量上限

全連通是最難的情況（例如 Number Partitioning、QAP 的 Q 都是全連通）。

| | P(2) | P(3) | P(4) |
|---|---|---|---|
| 本庫能嵌入的最大 Kₙ | K₁₀ | K₁₄ | K₁₆ |
| minorminer（seed 1） | K₁₀ | K₂₄ | 至少 K₃₆ |

測試的刻度是 n = 8, 10, 12, 14, 16, 18／20, 24, 30, 36；表中是成功的最大值，下一格即失敗
（minorminer 在 P(4) 只測到 K₃₆，那一格仍成功）。

在目錄的規模內兩者幾乎一樣；**規模放大之後本庫明顯較早用完**。差距來自 minorminer 另外有的
機制（chain 長度專用的改善回合、Pegasus 的結構化團嵌入 busclique 等），本庫沒有移植。
消費端讓使用者放大輸入時，應該照實顯示「本庫的啟發式找不到」，而不是「硬體放不下」。

## 這個模組**不是**什麼

- **不是最佳嵌入。** 啟發式，沒有最優性保證。
- **不是 `EmbeddingComposite` 實際會給的結果。** 那是完整的 minorminer 對真實 QPU 的 working graph
  跑出來的，而且帶隨機性。
- **找不到不代表不存在。** 上面的容量表就是反例：P(3) 放得下 K₂₄，本庫只找到 K₁₄。

## 驗證

`npm run verify:embed`（已併入 `verify:all`，不需要 Python）：

1. **拓樸**：`pegasusGraph` 與 `pegasusLayout` 對 `fixtures/pegasus-m{2,3,4,6}.json` 逐項比對：
   qubit 集合、coupler 集合完全一致，座標誤差 ≤ 1e−9（目前是 0）。
2. **檢查器自我測試**：餵給 `checkEmbedding` 各種刻意弄壞的嵌入（空 chain、共用 qubit、
   不存在的 qubit、不相連的 chain、缺 coupler、chain 數量不對），每一種都必須被擋下；
   兩種合法的必須通過。沒有這一段，一個永遠回答「合法」的檢查器也會讓下面全部通過。
3. **目錄**：31 個案例全部嵌入成功，且通過檢查器。

`npm run compare:minorminer`（**不在** `verify:all` 裡，需要 `pip install minorminer dwave-networkx`）
印出上面那張對照表。它只供參考，不算通過或失敗：minorminer 帶隨機性，也比本庫成熟，
重點是誠實記錄兩者的差距。

### 重新產生 fixture

```bash
pip install dwave-networkx
python scripts/gen-pegasus-fixture.py
```

只在 `dwave_networkx` 改了 Pegasus 的定義時才需要。目前的 fixture 由 `dwave_networkx 0.8.19`
產生（版本寫在每個 JSON 的 `generator` 欄位）。Ocean 10 會把 `dwave-networkx` 換成
`dwave-graphs`，屆時腳本的 import 要跟著改。
