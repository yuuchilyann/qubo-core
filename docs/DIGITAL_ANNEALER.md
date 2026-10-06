# 數位退火（Digital Annealer）演算法重現

`src/samplers/digitalAnnealer.ts` 依照富士通 Digital Annealer（DA）公開發表的演算法實作；
`src/hardware/daPrecision.ts` 檢查 Q 能否原封不動放進 DA 的整數暫存器。

> **這裡重現的是演算法，不是硬體。**DA 是富士通的專用 CMOS 晶片（「量子啟發」，晶片上沒有量子效應），
> 每一步的 n 個試翻在硬體上平行評估，有效場也在常數時間內更新完畢。CPU 做同樣的事每步要 O(n)。
> 所以這份實作能呈現的是**方法怎麼在能量地景上移動**：接受率、跳脫、最後的答案；
> 它**不能**代表富士通機器的速度，也不能用來評比富士通的產品。

## 演算法

出處：Aramon, Rosenberg, Valiante, Miyazawa, Tamura & Katzgraber,
“Physics-Inspired Optimization for Quadratic Unconstrained Problems Using a Digital Annealer”,
*Frontiers in Physics* 7:48（2019），Algorithm 2。

它是模擬退火（SA），只改兩處：

| | 單位元 SA（`trial: 'single'`） | DA（`trial: 'parallel'`） |
|---|---|---|
| 每一步 | 隨機挑一個位元，做 Metropolis 判定 | **n 個位元都做判定**，從通過的翻轉中均勻抽一個執行 |
| 卡住時 | 等溫度或運氣 | **動態偏移**：整步都沒有翻轉通過，就把 `E_off` 加上 `offsetIncrease`；判定改用 `Δ − E_off`；一旦有翻轉被接受就歸零 |

增益向量與 `tabu.ts`、`bruteForce.ts` 共用同一套：

```
g_k = q_kk + 2·Σ_{j≠k} q_kj·x_j          Δ_k = (1 − 2x_k)·g_k
```

### 預設排程

| 參數 | 預設 | 理由 |
|---|---|---|
| `tStart` | `maxΔ / ln 2` | 最大可能的上坡有一半機率被接受（與 `dwave-samplers` SA 的預設 β 範圍同一原則） |
| `tEnd` | `minΔ / ln 100` | 最小的非零上坡只剩 1% 機率被接受 |
| 降溫 | 每步幾何降溫 | 論文的 DA 每隔固定步數更新溫度；每步更新是它的極限情形 |
| `offsetIncrease` | `minΔ` | 論文把它當作要調的參數。設為最小的非零 \|Δ\|，跨過高度 h 的能障大約要 h / minΔ 步 |
| `sweeps` | 200 | 一個 sweep 是 n 步 |
| `runs` | 16 | 各自從隨機狀態出發的獨立退火 |

`maxΔ` 是單一翻轉可能造成的最大 \|Δ\|（每列 \|q_kk\| + 2Σ\|q_kj\| 的最大值），
`minΔ` 是最小的非零係數量級；見 `deltaRange()`。

`trace: true` 會記錄第一次退火的軌跡（溫度、能量、`E_off`、該步通過判定的翻轉數），降採樣到最多 600 點，供教學視圖使用。

## 實測（`npm run verify:anneal`）

預設排程，每個案例 32 次獨立退火；兩種 trial 用**同樣的步數**。
「命中」是該次退火的最佳值等於窮舉最佳值。

| 案例 | n | DA 命中 | 單位元 SA 命中 | DA 接受率 | SA 接受率 |
|---|---|---|---|---|---|
| §5.3 General 0/1 | 10 | 31/32 | 29/32 | 99% | 62% |
| §5.4 QAP | 9 | 32/32 | 31/32 | 73% | 38% |
| Capital Budgeting | 13 | 14/32 | 14/32 | 99% | 56% |
| Multiple Knapsack | 16 | 30/32 | 18/32 | 96% | 45% |
| P-Median | 15 | 32/32 | 20/32 | 76% | 37% |
| Warehouse Location | 15 | 28/32 | 17/32 | 77% | 30% |
| Linear Ordering | 14 | 31/32 | 23/32 | 81% | 47% |
| 其餘 24 個案例 | 4–16 | 32/32 | 31–32/32 | 65–100% | 32–70% |
| **合計** | | **966/992** | **916/992** | | |

讀法上要注意三點：

1. **同樣步數不等於同樣工作量。**DA 每步評估 n 個翻轉，單位元 SA 只評估一個。
   這正是論文的比較方式，因為硬體上那 n 個評估是同時完成的；在 CPU 上就不是了。
2. **差距集中在約束多的延伸案例**（Multiple Knapsack、P-Median、Warehouse Location、Linear Ordering），
   這些案例的懲罰項在地景上造出深而窄的谷，單位元 SA 的接受率掉到 30–47%。
   這與論文 §III 的推論一致：接受率越低，平行試翻的優勢越大。
3. **Capital Budgeting 兩者都只有 14/32。**這個案例的難處在別的地方，加長 sweeps 才會改善。
   這也提醒我們 DA 不是萬靈丹；獨立評比（Oshiyama & Ohzeki, *Sci. Rep.* 12:2146, 2022）同樣發現 DA 只在部分問題類型上領先。

數字由腳本印出；改了排程或 PRNG 要重跑並更新這張表。

## 精度

DA 收的是多項式 `Σ h_i x_i + Σ_{i<j} J_ij x_i x_j`，對應本專案的對稱 Q 為 `h_i = q_ii`、`J_ij = 2·q_ij`，
兩者都是定寬有號整數：

| 常數 | 世代 | 一次項 h | 二次項 J | 出處 |
|---|---|---|---|---|
| `DA_FIRST_GENERATION` | 第一代，1,024 位元 | 26 位元 | 16 位元 | Aramon et al. 2019 |
| `DA_THIRD_GENERATION` | 第三代起，100,000 位元 | 76 位元 | 64 位元 | 富士通 Computing as a Service Digital Annealer User's Guide（FujitsuDA3Solver） |

- `precisionReport(Q, target)`：是否為整數、最大 \|h\| 與 \|J\|、需要幾個位元、能否原封不動載入。
- `quantize(Q, target)`：放不下時，先**乘上同一個比例**撐滿暫存器，再四捨五入。這是論文處理高斯係數實例的做法，
  富士通的雲端服務也會自動做。同一個比例不會改變最佳解，**只有四捨五入會**。
  64 位元超過 double 的 53 位元尾數，所以 `quantize` 會把上限再壓到能精確表示能量總和的範圍。

**目錄裡 31 個案例的 Q 全是整數，最多需要 14 位元（一次項）／13 位元（二次項），
兩個世代都放得下。**精度在這裡是教學題，不是實際障礙：
把暫存器刻意縮到 8、6、4 位元時，Number Partitioning、General 0/1、Quadratic Knapsack、
Capital Budgeting 等係數跨度大的案例，最佳解會被四捨五入移走。懲罰係數 P 越大，跨度越大。

## 不做的事

- **不產生呼叫富士通服務的程式碼（目前）。**官方服務需要簽約與 access token；
  富士通的 DADK 不在 PyPI 公開。公開的路徑是 Fixstars Amplify 的 `FujitsuDA3SolverClient`／DA4 client，
  但沒有 token 就無法實際執行驗證，與 `verify:emit`「每支程式都真的跑過」的標準不符。
- **不實作平行回火版（PTDA）。**論文 §II.D 有描述，但它的回火交換在 CPU 上執行，不是 DA 本體。
- **不宣稱任何速度。**
