# 涵蓋範圍：收錄與不收錄

本庫的參考案例以 Glover, Kochenberger & Du，*Quantum Bridge Analytics I: A Tutorial on
Formulating and Using QUBO Models*（4OR 2019；arXiv:1811.11538）為範圍。這份文件逐項列出
論文**提到過的每一個問題與技巧**，標明收錄狀態；不收錄的，寫明原因與追查過的來源。

各案例的資料、勾稽狀態與實例設計見 [`CASE_CATALOG.md`](CASE_CATALOG.md)。

## 收錄判準

一個問題要成為案例，必須**同時**滿足：

1. **出現在論文裡**，並記下節與頁：§2–§5 的算例、§1 的問題清單，或 §6 引用他人研究時提到。
2. **有可公開查證的定義**：論文本身、§1 清單的出處 Kochenberger & Glover（2006），
   或 §6 引用的那篇研究。找不到定義時，不自行挑一個定義冒充論文的內容。
3. **能寫成原始約束模型**，交給同一支 `derive()` 轉成 QUBO。需要改引擎的（例如 v0.7.0 的
   高次項降階）先擴充引擎，並同步 Python 移植。
4. **能精確驗證**：實例小到可以窮舉。論文算例和論文印出的 Q 逐格比對；沒有算例的，
   改以「不經 QUBO、直接窮舉原始約束模型」（`solveConstrained`）為參照，原始變數上限 24。
5. **不是自有方法**：只收論文或文獻中的建模配方。

## 狀態代號

| 代號 | 意義 | `source` / `mention` |
|---|---|---|
| **算例** | 論文給了實例、印了 Q 與答案，逐格勾稽 | `worked` |
| **延伸・點名** | 在 §1 清單裡，但論文沒有算例；實例由本庫選定 | `mentioned` / `listed` |
| **延伸・引用** | 只在 §6 引用他人研究時提到；實例由本庫選定 | `mentioned` / `cited` |
| **不收錄** | 見下方原因 | — |

## §2–§5 的算例（11 項，全部收錄）

| § | 頁 | 問題 | id |
|---|---|---|---|
| 2 | p.5 | 說明用的 4 變數例 | `hello-world` |
| 3.1 | pp.6–7 | Number Partitioning | `number-partitioning` |
| 3.2 | pp.7–9 | Max-Cut | `max-cut` |
| 4.1 | pp.11–12 | Minimum Vertex Cover | `min-vertex-cover` |
| 4.2 | pp.13–14 | Set Packing | `set-packing` |
| 4.3 | pp.14–16 | Max 2-SAT | `max-2-sat` |
| 5.1 | pp.19–20 | Set Partitioning | `set-partitioning` |
| 5.2 | pp.21–24 | Graph Coloring | `graph-coloring` |
| 5.3 | pp.25–26 | General 0/1 Programming | `general-01` |
| 5.4 | pp.27–29 | Quadratic Assignment | `qap` |
| 5.5 | pp.29–30 | Quadratic Knapsack | `quadratic-knapsack` |

## §1 的問題清單（pp.3–4，23 項）

| 問題 | 狀態 | id |
|---|---|---|
| Quadratic Assignment | 算例（§5.4） | `qap` |
| Capital Budgeting | 延伸・點名 | `capital-budgeting` |
| Multiple Knapsack | 延伸・點名 | `multiple-knapsack` |
| Task Allocation（分散式運算） | 延伸・點名 | `task-allocation` |
| Maximum Diversity | 延伸・點名 | `max-diversity` |
| P-Median | 延伸・點名 | `p-median` |
| Asymmetric Assignment | **不收錄** | — |
| Symmetric Assignment | **不收錄** | — |
| Side Constrained Assignment | **不收錄** | — |
| Quadratic Knapsack | 算例（§5.5） | `quadratic-knapsack` |
| Constraint Satisfaction (CSPs) | 延伸・點名（與原作者寫法不同，見下） | `constraint-satisfaction` |
| Discrete Tomography | 延伸・點名 | `discrete-tomography` |
| Set Partitioning | 算例（§5.1） | `set-partitioning` |
| Set Packing | 算例（§4.2） | `set-packing` |
| Warehouse Location | 延伸・點名 | `warehouse-location` |
| Maximum Clique | 延伸・點名 | `max-clique` |
| Maximum Independent Set | 延伸・點名 | `max-independent-set` |
| Maximum Cut | 算例（§3.2） | `max-cut` |
| Graph Coloring | 算例（§5.2） | `graph-coloring` |
| Number Partitioning | 算例（§3.1） | `number-partitioning` |
| Linear Ordering | 延伸・點名 | `linear-ordering` |
| Clique Partitioning | 延伸・點名 | `clique-partitioning` |
| SAT problems | 算例（§4.3，2-SAT）＋延伸・點名（3-SAT） | `max-2-sat`、`max-3-sat` |

**20 項收錄，3 項不收錄。**

## §6 提到的問題（pp.31–35）

§6 不是問題清單，而是在介紹 QUBO 與量子計算、機器學習的關聯時，引用他人的研究。
其中有些是具體的最佳化問題，有些只是應用領域或方法。

| 頁 | 論文提到的內容 | 狀態 | id／原因 |
|---|---|---|---|
| p.31 | Ising 形式與 QUBO 的互換（`x′ = (x + 1)/2`） | 不收錄 | 是變數代換，不是問題 |
| p.31 | Lucas（2014）：graph and number partitioning | 已涵蓋 | `graph-partitioning`、`number-partitioning` |
| p.31 | Lucas：covering and set packing | 已涵蓋 | `min-vertex-cover`、`set-packing` |
| p.31 | Lucas：satisfiability | 已涵蓋 | `max-2-sat`、`max-3-sat` |
| p.31 | Lucas：matching | 延伸・引用 | `max-matching` |
| p.31 | Lucas：constrained spanning tree | **不收錄** | 見下 |
| p.31 | Pakin（2017）：迷宮中的最短路徑 | 延伸・引用 | `shortest-path`（標準流量寫法，不是 Pakin 的迷宮編碼） |
| p.32 | graph partitioning（Mniszewski 等；Ushijima-Mwesigwa 等） | 延伸・引用 | `graph-partitioning` |
| p.32 | graph clustering／community detection（Negre 等） | 延伸・引用 | `community-detection` |
| p.32 | traffic-flow optimization（Neukart 等） | 延伸・引用 | `traffic-flow`（照原論文的 QUBO 與 λ 規則） |
| p.32 | vehicle routing（Feld 等；Clark 等；Ohzeki 等） | 部分收錄 | `travelling-salesman`：單車、無容量的核心；多車與容量見下 |
| p.32 | maximum clique（Chapuis 等） | 已涵蓋 | `max-clique` |
| p.32 | cybersecurity（Munch 等；Reinhardt 等） | **不收錄** | 應用領域，論文沒有指出特定問題 |
| p.32 | predictive health analytics（De Oliveira 等；Sahner 等） | **不收錄** | 同上 |
| p.32 | financial portfolio management（Elsokkary 等；Kalra 等） | 延伸・引用 | `portfolio`（教科書的二元 Markowitz 寫法） |
| p.32 | IBM 神經型態電腦、Fujitsu Digital Annealer | 不適用 | 硬體平台，不是問題 |
| p.33 | QUBO 必須嵌入（編譯）到量子硬體上，本身就很難（Date 等，2019） | **工具功能** | 不是問題，所以不是案例；收在 `hardware/`：Pegasus 拓樸與嵌入啟發式，見 [`EMBEDDING.md`](EMBEDDING.md) |
| p.34 | QAOA 用於 MaxCut、MIS | 已涵蓋 | `max-cut`、`max-independent-set`；QAOA 本身是求解法 |
| p.34 | 以 set partitioning 做分群 | 已涵蓋 | `set-partitioning` |
| pp.34–35 | clique partitioning（correlation clustering）、modularity maximization | 已涵蓋 | `clique-partitioning`、`community-detection` |
| p.35 | 非負／二元矩陣分解（O'Malley 等） | **不收錄** | 見下 |
| p.35 | 監督式學習：Boltzmann machine、spin-glass 網路、CNN（Schneidman 等；Hamilton 等） | **不收錄** | 學習模型，不是最佳化實例 |
| p.35 | 以機器學習改善 QUBO 求解（roof duality、邏輯推論） | **不收錄** | 求解技巧，不是問題；不在案例集的範圍 |

## §7 的技巧

| 點 | 內容 | 狀態 |
|---|---|---|
| 3（p.36） | 邊變數換成點變數 | 已實作：`clique-partitioning` 用它建模；站台附錄有說明 |
| 4（pp.36–37） | 高次項降階（Rosenberg） | 已實作於引擎（`src/reduce.ts`，v0.7.0）；`max-3-sat` 用它 |
| 1、2、5、6 | 量子計算前景、邏輯分析、與 Lagrange 乘數的比較、求解方法 | 論述，沒有可建模的內容 |

## 不收錄的項目與原因

### Asymmetric／Symmetric／Side Constrained Assignment（§1）

**原因：找不到定義。** 這三個名稱在文獻中沒有唯一定義，追溯過的來源都只列名稱：

| 來源 | 結果 |
|---|---|
| Kochenberger & Glover（2006）§4（§1 清單的出處） | 只列名稱，與 2019 論文幾乎逐字相同 |
| 同文引用的 Boros & Hammer（1991）、Lewis 等（2004） | 主題分別是 Max-Cut、任務分配，無關 |
| Kochenberger 等（2014）綜述 | 只提到「various forms of assignment problems」 |
| Kochenberger 等（2004，OR Spectrum） | 非公開，未能確認 |

自行選一個定義再標成「論文提及的問題」，會把本庫的判斷冒充成論文的內容。
**若找到原作者的定義，可以重新評估。**

### Constrained Spanning Tree（§6 p.31）

**原因：規模與驗證方式。** 生成樹的難處在「必須連通、不能有環」：這無法用少數幾條線性
約束表達，Lucas（2014）的寫法要額外引入表示層級（深度）的變數，變數數隨節點數與邊數相乘成長。
在本庫要求的精確驗證規模（原始變數 ≤ 24）內，能放下的圖小到失去教學意義。

這是本庫判準下的取捨，不是 QUBO 做不到。**若日後接受啟發式驗證（非窮舉），可以重新評估。**

### 多車、有容量的 Vehicle Routing（§6 p.32）

**原因：規模。** 收錄的 `travelling-salesman` 是車輛路徑的單車、無容量核心；被引用的研究在這個
結構上再加車輛數與容量。多一輛車就要多一組「車 × 城市 × 順序」變數，容量還要 slack，
最小的有意義實例也會超過窮舉上限。

### Cybersecurity、Predictive Health Analytics（§6 p.32）

**原因：不是單一問題。** 論文只說 QUBO 被用在這些**領域**，沒有指出是哪一個最佳化問題，
被引用的研究也各自用不同的模型。沒有可以照著建的定義。

### 非負／二元矩陣分解（§6 p.35）

**原因：不是一個 QUBO 實例。** 被引用的做法（O'Malley 等）是交替求解：固定一個因子矩陣，
另一個因子的每一欄才是一個 QUBO，反覆多輪。單一靜態案例呈現不了這個流程。

### 監督式學習相關（§6 p.35）

**原因：是學習模型，不是最佳化實例。** Boltzmann machine、spin-glass 網路等是用 Ising／QUBO
形式**表示**模型，重點在訓練；案例集收的是「給定資料、求一組最佳 0/1 決策」的問題。

### 以機器學習改善求解（§6 p.35）、Ising 互換（§6 p.31）

**原因：是技巧，不是問題。** Roof duality、邏輯推論屬於求解前處理；Ising 互換是變數代換。
兩者都可能成為本庫的**工具功能**，但不是案例。

## 與原作者寫法的對照

延伸案例的實例都是本庫選的。能找到原作者或被引用研究的寫法時，以它為準或註明差異：

| 案例 | 對照來源 | 關係 |
|---|---|---|
| `warehouse-location` | Kochenberger & Glover（2006）§5.1 | **一致**：y 取補數再用 Transformation #2，展開就是 p.10 第 4 列 |
| `constraint-satisfaction` | Kochenberger & Glover（2006）§5.2 | **不同**：原作者是線性等式組 `Ax = b`；本庫用 Not-All-Equal，為了示範三次項抵消 |
| `traffic-flow` | Neukart 等（2017） | **照原論文**：QUBO 與 λ 規則都相同 |
| `community-detection` | Negre 等 | **相同形式**：k 個社群、模組度；係數乘上 (2m)² 取整 |
| `shortest-path` | Pakin（2017） | **不同**：本庫用標準流量守恆寫法，不是迷宮編碼 |
| `portfolio` | Kochenberger & Ma（2019）白皮書 | **未能對照**：白皮書未公開；本庫用教科書寫法 |

## 未能取得的文獻

| 文獻 | 影響 |
|---|---|
| Glover, Kochenberger, Hennig & Du（Annals of OR, 2022）：本論文的擴充版，新增「進階模型」與「比較性計算結果」兩節 | 新增的兩節可能有本庫未收錄的算例。作者網站上的同名 PDF 經確認是 2019 原版 |
| Kochenberger, Glover, Alidaee & Rego（OR Spectrum, 2004） | 可能有三種指派問題的定義 |
| Kochenberger & Ma（2019）投資組合白皮書 | 原作者的投資組合寫法 |

另外查過：原作者沒有公開的 GitHub。網路上有第三方實作
（[hvidberrrg/d-wave](https://github.com/hvidberrrg/d-wave)），涵蓋的論文算例本庫都已逐格勾稽，
它的最大獨立集用的是另一張圖，無法交叉比對。

## 新增或變更狀態時

任何案例的新增、移除，或「不收錄」項目重新評估，都要同步更新這份文件與
[`CASE_CATALOG.md`](CASE_CATALOG.md)。
