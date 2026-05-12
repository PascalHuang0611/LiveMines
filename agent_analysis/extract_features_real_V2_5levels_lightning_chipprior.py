"""
====================================================================
LiveMines Agent DNA 萃取引擎 v2 — 跨遊戲遷移版
====================================================================

【背景】
本腳本的資料來源是「舊遊戲」(6 格 + 轉輪二級玩法),
但模擬目標是「新遊戲」LiveMines (9 格 + CASHOUT 二級玩法)。
因此我們無法簡單地說這份 DNA 是「真實映射」,
而是一份「以舊遊戲行為為基礎,對新遊戲做先驗假設」的 DNA。

【三層特徵架構】
為了讓下游使用者清楚知道哪些欄位可信、哪些是猜的,
本版本用前綴明確區分三類欄位:

  observed_*  從舊遊戲資料「直接觀察統計」出來的事實。
              例:observed_avg_bet, observed_bet_std

  trait_*     雖然從舊遊戲萃取,但屬於「跨遊戲穩定的人格特徵」,
              理論上可以直接遷移到新遊戲。
              例:trait_martingale_multiplier (凹單性格)、
                  trait_win_retrench_ratio (見好就收性格)、
                  trait_break_duration_minutes (生活節奏)。

  prior_*     針對新遊戲做的「先驗假設」,因舊資料中沒有對應行為。
              這些欄位「等到新遊戲上線、收到真實資料後,應該被覆寫」。
              例:prior_grid_preferences_9 (6→9 格的擴散)、
                  prior_cashout_propensity (CASHOUT 決策的先驗推估)。

  synthetic_* 完全合成,沒有任何資料依據,僅作為 placeholder。
              下游模擬器若使用,需自行承擔風險。
              例:synthetic_wakeup_minute, synthetic_bonus_risk_prob

【時間/頻次三維度】(v2.1 新增)
為了讓模擬器產生的人流不要「同一小時排隊湧入」,
新增三個時間維度的欄位,讓每位玩家有獨立的上線節奏:

  trait_hourly_activity_vector  長度 24 的機率向量,反映該玩家在每個
                                 小時的活躍權重。雙峰玩家(早晚高峰)
                                 不會被眾數壓成單峰。
  trait_daily_login_probability  在資料窗口內的上線天數佔比,反映該玩家
                                 「今天會不會出現」。可用於模擬日與日
                                 之間的 DAU 波動。
  trait_sessions_per_active_day  該玩家活躍日的平均 session 數,反映
                                 「玩 5 局休 10 分鐘再玩」這種短促多次
                                 的特徵。

【替換 / 校準路徑】
等新遊戲上線後,蒐集到真實的 Lightning、CASHOUT 行為與 9 格下注分佈,
應該執行的覆寫順序:
  1. prior_grid_preferences_9 → observed_grid_preferences_9
  2. prior_buy_lightning_prob → observed_buy_lightning_prob
  3. prior_cashout_propensity → observed_cashout_propensity
  4. prior_cashout_stop_level → observed_cashout_stop_level
  5. prior_bet_denomination_mode / prior_chip_denomination_weights
     目前只能由下注金額與下注分佈 proxy 推估,不是 observed。
     因為舊注單只有每格 Bet Amount,沒有玩家實際點擊的面額組合。
     新遊戲上線並取得 chip clickstream 後,再覆寫為
     observed_bet_denomination_mode / observed_chip_denomination_weights。
  6. synthetic_bonus_risk_prob → observed_bonus_risk_prob
"""

import pandas as pd
import numpy as np
import glob
import os
import json
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


# ====================================================================
# 設定區
# ====================================================================

# 新遊戲格數 (LiveMines = 9)
NEW_GRID_COUNT = 9

# 舊遊戲格數 (轉輪版 = 6)
OLD_GRID_COUNT = 6

# 6→9 格的鄰接映射 (用於把舊偏好擴散到新格子)
# key:新格子編號 (7/8/9);value:在舊遊戲中與其位置最相近的格子清單
# 預設假設舊版是 2x3、新版是 3x3,新增的下排 (7/8/9) 直接繼承上排 (4/5/6)。
# 如果實際佈局不是這樣,請覆寫這個 mapping。
DEFAULT_GRID_NEIGHBOR_MAP = {
    7: [4],
    8: [5],
    9: [6],
}

# 鄰接擴散時,新格子初始機率的混合比例
# new_prob = NEIGHBOR_WEIGHT * neighbor_avg + (1 - NEIGHBOR_WEIGHT) * global_avg
# 設高一點代表更相信「玩家會延續鄰近偏好」,設低代表更傾向均勻先驗。
NEIGHBOR_WEIGHT = 0.6

# 新遊戲固定可選下注面額。
# DNA 只描述玩家偏好;實際組合由模擬器依照此清單解析。
BET_DENOMINATIONS = [1, 5, 10, 50, 100, 500, 1000]


# 舊遊戲 EXBET 欄位偵測設定。
# 若資料欄位名稱不同,優先在這裡補上欄位名稱,不要改核心邏輯。
# 支援欄位值型態:
#   - bool / 0-1 / Y-N / YES-NO / TRUE-FALSE
#   - 字串包含 EXBET、EX BET、EXTRA BET、LIGHTNING、BONUS BUY、FEATURE BUY
EXBET_INDICATOR_COLUMNS = [
    'EXBET', 'ExBet', 'Ex Bet', 'EX Bet', 'Extra Bet', 'ExtraBet',
    'Is EXBET', 'Is ExBet', 'EXBET Flag', 'ExBet Flag',
    'Buy EXBET', 'Buy ExBet', 'Buy Extra Bet',
    'Lightning', 'Buy Lightning',
    'Bonus Buy', 'Feature Buy', 'Side Bet',
]

EXBET_KEYWORDS = [
    'EXBET', 'EX BET', 'EX-BET', 'EXTRA BET', 'EXTRABET',
    'LIGHTNING', 'BONUS BUY', 'FEATURE BUY', 'BUY FEATURE',
]



# ====================================================================
# 共用工具 — EXBET / Lightning 購買偏好偵測
# ====================================================================

def _series_to_purchase_flag(series):
    """
    將可能代表 EXBET 購買的欄位轉成 0/1。

    回傳:
      - flag: 0/1 Series
      - confidence: 欄位是否看起來真的有提供購買訊號
    """
    if series is None:
        return None, False

    s = series.copy()

    # bool 欄位最直接。
    if pd.api.types.is_bool_dtype(s):
        return s.fillna(False).astype(int), True

    # 數值欄位:>0 視為有購買。若全為空或全為 0,仍保留為可用訊號。
    numeric = pd.to_numeric(s, errors='coerce')
    if numeric.notna().mean() >= 0.8:
        return (numeric.fillna(0) > 0).astype(int), True

    # 字串欄位:吃常見 yes/no、true/false、購買關鍵字。
    text = s.astype(str).str.strip().str.upper()
    positives = {'1', 'Y', 'YES', 'TRUE', 'T', 'BUY', 'BOUGHT', 'PURCHASED'}
    negatives = {'0', 'N', 'NO', 'FALSE', 'F', 'NONE', 'NAN', '', 'NULL'}

    positive_mask = text.isin(positives)
    negative_mask = text.isin(negatives)
    keyword_mask = text.apply(lambda v: any(k in v for k in EXBET_KEYWORDS))

    recognized = positive_mask | negative_mask | keyword_mask
    if recognized.mean() == 0:
        return pd.Series(0, index=s.index, dtype=int), False

    flag = (positive_mask | keyword_mask).astype(int)
    return flag, True


def add_exbet_purchase_flag(df):
    """
    嘗試從舊遊戲注單中找出「是否購買 EXBET」的 0/1 欄位。

    設計原則:
      1. 若有明確 EXBET 欄位,直接使用。
      2. 若沒有明確欄位,再掃描常見文字欄位是否包含 EXBET 關鍵字。
      3. 若仍找不到,EXBET_Purchase_Flag 全部設為 NaN,
         後續 prior_buy_lightning_prob 會改用行為 proxy 推估。
    """
    detected_sources = []
    candidate_flags = []

    # 1) 明確欄位名稱
    for col in EXBET_INDICATOR_COLUMNS:
        if col in df.columns:
            flag, confidence = _series_to_purchase_flag(df[col])
            if confidence:
                candidate_flags.append(flag.rename(col))
                detected_sources.append(col)

    # 2) 欄位名稱本身含 EXBET / LIGHTNING / FEATURE / BONUS
    for col in df.columns:
        col_upper = str(col).upper()
        if col in detected_sources:
            continue
        if any(k in col_upper for k in ['EXBET', 'EX BET', 'LIGHTNING', 'FEATURE', 'BONUS BUY']):
            flag, confidence = _series_to_purchase_flag(df[col])
            if confidence:
                candidate_flags.append(flag.rename(col))
                detected_sources.append(col)

    # 3) 文字欄位內容包含 EXBET 關鍵字,例如 Bet Type / Bet Place / Remark
    text_scan_cols = [
        col for col in df.columns
        if df[col].dtype == object and col not in detected_sources
    ]
    for col in text_scan_cols:
        text = df[col].astype(str).str.upper()
        keyword_mask = text.apply(lambda v: any(k in v for k in EXBET_KEYWORDS))
        if keyword_mask.mean() > 0:
            candidate_flags.append(keyword_mask.astype(int).rename(col))
            detected_sources.append(col)

    if candidate_flags:
        flags_df = pd.concat(candidate_flags, axis=1)
        df['EXBET_Purchase_Flag'] = flags_df.max(axis=1).astype(int)
        print(f"🧩 偵測到 EXBET 購買訊號欄位: {detected_sources}")
    else:
        df['EXBET_Purchase_Flag'] = np.nan
        print("⚠️  未偵測到明確 EXBET 購買欄位,Buy_Lightning_Prob 將使用行為 proxy 推估。")

    return df

# ====================================================================
# Section 1 — 載入與清理
# ====================================================================

def load_raw_bets(data_dir):
    """掃描資料夾、合併所有注單檔、做欄位清理與型別轉換。"""
    print(f"📂 正在掃描資料夾 {data_dir} 尋找注單資料...")
    all_files = glob.glob(os.path.join(data_dir, "*_LKDB*.csv"))
    if not all_files:
        print("❌ 找不到符合 *_LKDB*.csv 的檔案")
        return None

    df_list = []
    for file in all_files:
        try:
            temp_df = pd.read_csv(file, low_memory=False, index_col=False, on_bad_lines='skip')

            if 'Bet Amount' in temp_df.columns:
                temp_df['Bet Amount'] = temp_df['Bet Amount'].astype(str).str.replace(',', '')
            if 'Member Win/Loss' in temp_df.columns:
                temp_df['Net_Profit'] = temp_df['Member Win/Loss'].astype(str).str.replace(',', '')
            elif 'Payout' in temp_df.columns:
                temp_df['Payout'] = temp_df['Payout'].astype(str).str.replace(',', '')
                temp_df['Net_Profit'] = (
                    pd.to_numeric(temp_df['Payout'], errors='coerce')
                    - pd.to_numeric(temp_df['Bet Amount'], errors='coerce')
                )

            temp_df['Bill Time'] = pd.to_datetime(temp_df['Bill Time'].astype(str), errors='coerce')
            temp_df['Bet Amount'] = pd.to_numeric(temp_df['Bet Amount'], errors='coerce')
            temp_df['Net_Profit'] = pd.to_numeric(temp_df['Net_Profit'], errors='coerce')

            valid_mask = temp_df['Bill Time'].notna() & temp_df['Bet Amount'].notna()
            temp_df = temp_df[valid_mask].copy()
            temp_df['Date'] = os.path.basename(file).split('_')[0]
            df_list.append(temp_df)
        except Exception as e:
            print(f"  ❌ 讀取 {os.path.basename(file)} 失敗: {e}")

    if not df_list:
        return None

    df = pd.concat(df_list, ignore_index=True)
    df = add_exbet_purchase_flag(df)
    return df


def split_active_players(df, min_rounds):
    """標記總局數 >= min_rounds 的活躍玩家，但不剔除觀光客。"""
    account_counts = df['Account'].value_counts()
    active_accounts = account_counts[account_counts >= min_rounds].index
    casual_accounts = account_counts[account_counts < min_rounds].index
    print(f"✅ 載入完成,共 {len(df)} 筆有效注單。")
    print(f"🎯 活躍玩家 (>= {min_rounds} 局): {len(active_accounts)} 位。")
    print(f"🚶 觀光玩家 (< {min_rounds} 局): {len(casual_accounts)} 位。")
    return df, active_accounts, casual_accounts


# ====================================================================
# Section 2 — 單局聚合
# ====================================================================

def aggregate_by_round(df):
    """以 Account + Date + Game Code 聚合成單局。"""
    round_agg = df.groupby(['Account', 'Date', 'Game Code']).agg(
        Bill_Time=('Bill Time', 'first'),
        Total_Bet_Amount=('Bet Amount', 'sum'),
        Max_Bet_Amount=('Bet Amount', 'max'),
        Net_Profit=('Net_Profit', 'sum'),
        Bet_Count=('Bet Place', 'nunique'),
        Bet_Places_List=('Bet Place', lambda x: list(set(x))),
        Exbet_Purchased=('EXBET_Purchase_Flag', 'max'),
    ).reset_index()

    round_agg['Max_Bet_Ratio'] = round_agg['Max_Bet_Amount'] / round_agg['Total_Bet_Amount']
    round_agg = round_agg.sort_values(by=['Account', 'Bill_Time']).reset_index(drop=True)
    return round_agg


# ====================================================================
# Section 3 — 「人格特徵」trait_*
# (跨遊戲穩定,可直接遷移到新遊戲)
# ====================================================================

def extract_traits(round_agg):
    """萃取跨遊戲穩定的人格特徵。"""

    # ---- 3.1 Stickiness:贏格黏著度 (修正版,Date 重置) ----
    # 修正點:原版只 groupby(Account),會把昨天最後一局誤當成今天第一局的前一局。
    # 這裡改成 groupby(Account, Date),確保比較只發生在同一天內。
    round_agg['Prev_Bet_Places'] = round_agg.groupby(['Account', 'Date'])['Bet_Places_List'].shift(1)
    round_agg['Prev_Net_Profit'] = round_agg.groupby(['Account', 'Date'])['Net_Profit'].shift(1)

    def calc_stickiness(row):
        if (row['Prev_Net_Profit'] is not None
                and pd.notna(row['Prev_Net_Profit'])
                and row['Prev_Net_Profit'] > 0
                and isinstance(row['Prev_Bet_Places'], list)):
            prev_set = set(row['Prev_Bet_Places'])
            curr_set = set(row['Bet_Places_List'])
            if not prev_set:
                return np.nan
            return len(curr_set.intersection(prev_set)) / len(prev_set)
        return np.nan

    round_agg['Stickiness'] = round_agg.apply(calc_stickiness, axis=1)
    stickiness_df = (
        round_agg.groupby(['Account'])['Stickiness']
        .mean().reset_index(name='trait_win_grid_stickiness')
    )

    # ---- 3.2 馬丁格爾倍率:連輸後的注額放大 ----
    round_agg['Next_Bet_Amount'] = round_agg.groupby(['Account'])['Total_Bet_Amount'].shift(-1)
    round_agg['Bet_Change_Ratio'] = round_agg['Next_Bet_Amount'] / round_agg['Total_Bet_Amount']
    round_agg['Bet_Change_Ratio'] = round_agg['Bet_Change_Ratio'].replace([np.inf, -np.inf], np.nan)

    is_win_or_tie = round_agg['Net_Profit'] >= 0
    loss_blocks = is_win_or_tie.cumsum()
    round_agg['Loss_Streak'] = round_agg.groupby(['Account', loss_blocks]).cumcount()

    martingale_df = (
        round_agg[round_agg['Loss_Streak'] >= 2]
        .groupby(['Account'])['Bet_Change_Ratio']
        .mean().reset_index(name='trait_martingale_multiplier')
    )

    # ---- 3.3 大贏後注額變化 (見好就收 vs 乘勝追擊) ----
    round_agg['Is_Big_Win'] = round_agg['Net_Profit'] >= (round_agg['Total_Bet_Amount'] * 2)
    win_retrench_df = (
        round_agg[round_agg['Is_Big_Win']]
        .groupby(['Account'])['Bet_Change_Ratio']
        .mean().reset_index(name='trait_win_retrench_ratio')
    )

    # ---- 3.4 碎片化遊玩節奏 ----
    round_agg['Time_Since_Last_Bet'] = (
        round_agg.groupby(['Account'])['Bill_Time'].diff().dt.total_seconds() / 60.0
    )
    break_mask = round_agg['Time_Since_Last_Bet'] > 15
    break_durations = (
        round_agg[break_mask].groupby(['Account'])['Time_Since_Last_Bet']
        .mean().reset_index(name='trait_break_duration_minutes')
    )
    break_counts = (
        round_agg[break_mask].groupby(['Account'])
        .size().reset_index(name='Break_Count')
    )

    # ---- 3.5 單日 PnL 軌跡 → 停損停利 (修正版) ----
    # 修正點:原版用 groupby(Account).agg(min/max),抓的是「終身最慘/最好的一天」,
    # 容易被單一極端日主導。這裡改成先算每日 min/max,再對所有日子取「中位數」,
    # 更接近「典型一天」的玩家心理停損點。
    round_agg['Cumulative_PnL'] = round_agg.groupby(['Account', 'Date'])['Net_Profit'].cumsum()
    daily_extremes = round_agg.groupby(['Account', 'Date']).agg(
        Daily_Min_PnL=('Cumulative_PnL', 'min'),
        Daily_Max_PnL=('Cumulative_PnL', 'max'),
    ).reset_index()
    session_extremes = daily_extremes.groupby('Account').agg(
        Typical_Max_Drawdown=('Daily_Min_PnL', 'median'),
        Typical_Peak_Profit=('Daily_Max_PnL', 'median'),
    ).reset_index()

    return round_agg, stickiness_df, martingale_df, win_retrench_df, break_durations, break_counts, session_extremes


# ====================================================================
# Section 3.5 — 時間/頻次特徵 (v2.1)
# (跨遊戲穩定的生活節奏訊號)
# ====================================================================

def extract_temporal_patterns(round_agg, total_observation_days):
    """
    萃取三個時間維度的特徵,讓模擬器產生的人流呈現「隨機湧入」而非排隊。

    回傳 dict,包含三個 DataFrame:
      - hourly_df:   trait_hourly_activity_vector (長度 24 的 JSON 陣列)
      - login_df:    trait_daily_login_probability (0~1)
      - sessions_df: trait_sessions_per_active_day (>=1)
    """
    # ---- 3.5.1 24 小時活躍向量 ----
    # 用「下注時間」而非「session 起點」當分母,樣本量大且更穩定。
    # 結果是「該玩家有多少比例的下注發生在每個小時」,當作上線意願的代理指標。
    tmp = round_agg.copy()
    tmp['hour'] = tmp['Bill_Time'].dt.hour
    hourly_counts = tmp.groupby(['Account', 'hour']).size().unstack(fill_value=0)

    # 補齊沒出現過的小時 (column 0~23 都要存在)
    for h in range(24):
        if h not in hourly_counts.columns:
            hourly_counts[h] = 0
    hourly_counts = hourly_counts[list(range(24))]

    # 歸一化:每位玩家的 24 維加總 = 1
    row_sums = hourly_counts.sum(axis=1)
    hourly_normalized = hourly_counts.div(row_sums, axis=0).fillna(1.0 / 24)

    hourly_df = hourly_normalized.apply(
        lambda row: json.dumps([round(float(x), 4) for x in row.values]),
        axis=1,
    ).reset_index(name='trait_hourly_activity_vector')

    # ---- 3.5.2 每日上線機率 ----
    # 在資料觀察窗口內,該玩家出現的天數佔比。
    # 註:這只反映「觀察窗口內」的行為,如果窗口太短 (例如 3 天),
    #     會有偏誤。建議用 >= 14 天的資料計算才有意義。
    active_days = round_agg.groupby('Account')['Date'].nunique()
    login_prob = (active_days / total_observation_days).clip(upper=1.0)
    login_df = login_prob.reset_index(name='trait_daily_login_probability')

    # ---- 3.5.3 每個活躍日的 session 數 ----
    # 定義:Session 起點 = 第一局 + 每個 break (>15min) 之後的第一局。
    #       所以總 session 數 = break_count + 1。
    #       平均每個活躍日的 session 數 = total_sessions / active_days。
    break_counts = (
        (round_agg['Time_Since_Last_Bet'] > 15)
        .groupby(round_agg['Account']).sum()
        .rename('break_count')
    )
    sessions_per_day = ((break_counts + 1) / active_days).clip(lower=1.0)
    sessions_df = sessions_per_day.reset_index(name='trait_sessions_per_active_day')

    return {
        'hourly_df': hourly_df,
        'login_df': login_df,
        'sessions_df': sessions_df,
    }


# ====================================================================
# Section 4 — 「觀察特徵」observed_*
# (從舊資料直接統計的事實,但部分指標的「新遊戲意涵」可能會偏移)
# ====================================================================

def aggregate_to_user(round_agg, traits_results):
    """聚合到 user-level,合併所有 traits。"""
    (round_agg,
     stickiness_df, martingale_df, win_retrench_df,
     break_durations, break_counts, session_extremes) = traits_results

    user_agg = round_agg.groupby(['Account']).agg(
        observed_total_rounds=('Game Code', 'count'),
        observed_active_days=('Date', 'nunique'),
        trait_primary_play_hour=(
            'Bill_Time',
            lambda x: int(x.dt.hour.mode()[0]) if not x.empty else 20,
        ),
        observed_avg_bet=('Total_Bet_Amount', 'mean'),
        observed_bet_std=('Total_Bet_Amount', 'std'),
        observed_avg_coverage_ratio_old=(
            'Bet_Count', lambda x: (x / OLD_GRID_COUNT).mean()
        ),
        observed_grid_count_std=('Bet_Count', 'std'),
        observed_avg_max_bet_ratio=('Max_Bet_Ratio', 'mean'),
        observed_exbet_purchase_rate=('Exbet_Purchased', 'mean'),
    ).reset_index()

    user_agg['trait_daily_session_length'] = (
        (user_agg['observed_total_rounds'] / user_agg['observed_active_days']).astype(int)
    )

    for d in [martingale_df, win_retrench_df, break_durations, break_counts,
              session_extremes, stickiness_df]:
        user_agg = pd.merge(user_agg, d, on='Account', how='left')

    user_agg['Break_Count'] = user_agg['Break_Count'].fillna(0)
    user_agg['trait_micro_session_length'] = (
        user_agg['observed_total_rounds']
        / (user_agg['Break_Count'] + user_agg['observed_active_days'])
    )

    avg_bet_safe = user_agg['observed_avg_bet'].replace(0, 1)
    user_agg['trait_session_stop_loss_multi'] = (
        np.abs(user_agg['Typical_Max_Drawdown']) / avg_bet_safe
    ).fillna(20)
    user_agg['trait_session_take_profit_multi'] = (
        user_agg['Typical_Peak_Profit'] / avg_bet_safe
    ).fillna(30)

    fill_defaults = {
        'observed_bet_std': 0,
        'observed_grid_count_std': 0,
        'trait_martingale_multiplier': 1.0,
        'trait_win_retrench_ratio': 1.0,
        'trait_win_grid_stickiness': 0.5,
        'trait_break_duration_minutes': 30.0,
    }
    user_agg = user_agg.fillna(value=fill_defaults)

    user_agg['trait_martingale_multiplier'] = user_agg['trait_martingale_multiplier'].clip(1.0, 10.0)
    user_agg['trait_session_stop_loss_multi'] = user_agg['trait_session_stop_loss_multi'].clip(lower=5.0)
    user_agg['trait_session_take_profit_multi'] = user_agg['trait_session_take_profit_multi'].clip(lower=5.0)
    user_agg['trait_micro_session_length'] = user_agg['trait_micro_session_length'].clip(lower=1)

    bet_dist = np.where(user_agg['observed_avg_max_bet_ratio'] >= 0.6, 'anchor', 'equal')
    user_agg['trait_bet_distribution_type'] = bet_dist
    user_agg['trait_anchor_bet_ratio'] = user_agg['observed_avg_max_bet_ratio'].clip(0.5, 0.95)

    return user_agg


# ====================================================================
# Section 5 — 觀察:舊遊戲 6 格偏好
# ====================================================================

def extract_old_grid_preferences(df):
    """統計每位玩家在舊遊戲 6 格上的真實下注機率分佈。"""
    grid_counts = df.groupby(['Account', 'Bet Place']).size().unstack(fill_value=0)
    grid_probs = grid_counts.div(grid_counts.sum(axis=1), axis=0)
    # 只保留舊遊戲的格子 (1~6),避免奇怪的格子編號污染
    old_cols = [c for c in grid_probs.columns if c in range(1, OLD_GRID_COUNT + 1)]
    return grid_probs[old_cols]


# ====================================================================
# Section 6 — 先驗推估 prior_*
# (針對新遊戲做的假設,等新遊戲資料來後應該被覆寫)
# ====================================================================

def derive_prior_grid_preferences_9(old_grid_probs, neighbor_map=None, neighbor_weight=NEIGHBOR_WEIGHT):
    """
    把 6 格的真實偏好「鄰接擴散」到 9 格,而非均勻外推。

    對每位玩家:
      1. 新格子 (7/8/9) 的初始機率 = neighbor_weight * 鄰格平均 + (1 - neighbor_weight) * 全局平均
      2. 重新 normalize 讓 9 格機率和為 1

    這仍是一個「先驗假設」 — 假設玩家對新格子的偏好會延續他對相近位置的偏好。
    新遊戲上線後,這個欄位應該被觀察值覆寫。
    """
    if neighbor_map is None:
        neighbor_map = DEFAULT_GRID_NEIGHBOR_MAP

    prior = old_grid_probs.copy()
    global_avg = prior.mean(axis=1)

    for new_grid in range(OLD_GRID_COUNT + 1, NEW_GRID_COUNT + 1):
        neighbors = neighbor_map.get(new_grid, [])
        valid_neighbors = [n for n in neighbors if n in prior.columns]

        if valid_neighbors:
            neighbor_avg = prior[valid_neighbors].mean(axis=1)
            prior[new_grid] = neighbor_weight * neighbor_avg + (1 - neighbor_weight) * global_avg
        else:
            prior[new_grid] = global_avg

    prior_normalized = prior.div(prior.sum(axis=1), axis=0)
    prior_normalized = prior_normalized[sorted(prior_normalized.columns)]

    out = prior_normalized.apply(
        lambda row: json.dumps([round(float(x), 4) for x in row.values]),
        axis=1,
    ).reset_index(name='prior_grid_preferences_9')
    return out


def derive_prior_target_grids(user_agg):
    """
    在 9 格的世界中,玩家「典型一局會壓幾格」的先驗。
    用舊遊戲的覆蓋率比例,等比例映射到 9 格。
    註:這假設玩家會維持「覆蓋率」(coverage 心理),
        但實際上玩家也可能維持「絕對格數」(habit 心理),
        新遊戲上線後需要觀察真實值再校準。
    """
    target = np.round(user_agg['observed_avg_coverage_ratio_old'] * NEW_GRID_COUNT).astype(int)
    return target.clip(1, NEW_GRID_COUNT)



def derive_prior_buy_lightning(user_agg):
    """
    從舊遊戲 EXBET 購買行為推估新遊戲 Lightning 購買機率。

    語意分層:
      - observed_exbet_purchase_rate:舊遊戲真實 EXBET 購買率,若資料有欄位就直接統計。
      - trait_extra_feature_affinity:玩家對「額外購買功能」的偏好。
      - prior_buy_lightning_prob:遷移到新遊戲 Lightning 的購買先驗。

    若舊資料沒有可辨識的 EXBET 欄位,則退回 V1 的 proxy 邏輯:
      覆蓋率越高 + 連輸後越會加碼 → 越可能購買 Lightning。
    這種情況會標記 buy_lightning_source = 'proxy_from_behavior'。
    """
    observed = user_agg.get('observed_exbet_purchase_rate')

    proxy = (
        user_agg['observed_avg_coverage_ratio_old'].clip(0, 1) * 0.5
        + (1 - 1 / user_agg['trait_martingale_multiplier'].clip(lower=1)) * 0.5
    ).clip(0.05, 0.8)

    if observed is None:
        affinity = proxy
        source = pd.Series('proxy_from_behavior', index=user_agg.index)
    else:
        observed_num = pd.to_numeric(observed, errors='coerce')
        has_observed = observed_num.notna()

        # 若有真實 EXBET 資料,以真實購買率為主;若個別玩家沒有觀察值,用 proxy 補。
        affinity = observed_num.where(has_observed, proxy)
        source = pd.Series(
            np.where(has_observed, 'observed_exbet', 'proxy_from_behavior'),
            index=user_agg.index,
        )

    trait_extra_feature_affinity = affinity.clip(0.0, 1.0).round(4)
    prior_buy_lightning_prob = trait_extra_feature_affinity.clip(0.05, 0.8).round(4)
    return trait_extra_feature_affinity, prior_buy_lightning_prob, source


def derive_bet_denomination_preferences(user_agg):
    """
    推估玩家在新遊戲固定面額 [1, 5, 10, 50, 100, 500, 1000] 下的下注面額偏好。

    注意:這裡不產生每局實際籌碼組合,只輸出 DNA 層級的偏好。
    模擬器應該先根據 Avg_Bet_Amount、Martingale、Win_Retrench 等欄位產生 raw bet amount,
    再用這些偏好把 raw amount 轉成合法面額組合。

    欄位語意:
      - prior_bet_denomination_mode:
          exact_combo       偏好用多個面額精準湊出目標金額
          single_chip       偏好單一面額,少點擊
          high_denom        偏好大面額,少籌碼數
          low_denom         偏好小面額,精細控制
          balanced          沒有極端偏好
      - prior_preferred_chip_count:單一格下注時偏好的籌碼數量,1~5。
      - prior_chip_denomination_weights:長度 7 的 JSON array,對應 BET_DENOMINATIONS。
      - chip_dna_source:固定為 synthetic_prior_from_amount_only,表示不是從真實籌碼點擊資料觀察而來。
    """
    avg_bet = pd.to_numeric(user_agg['observed_avg_bet'], errors='coerce').fillna(0)
    bet_std = pd.to_numeric(user_agg['observed_bet_std'], errors='coerce').fillna(0)
    anchor_ratio = pd.to_numeric(user_agg['trait_anchor_bet_ratio'], errors='coerce').fillna(0.5)
    martingale = pd.to_numeric(user_agg['trait_martingale_multiplier'], errors='coerce').fillna(1.0)

    # 注額波動係數:高波動玩家比較可能接受不同面額組合;低波動玩家比較固定。
    cv = (bet_std / avg_bet.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0)

    modes = []
    preferred_counts = []
    weight_rows = []

    denoms = np.array(BET_DENOMINATIONS, dtype=float)

    for a, c, anchor, martin in zip(avg_bet, cv, anchor_ratio, martingale):
        # 1) 模式判斷:先用玩家下注規模,再用 anchor / 波動 / 凹單調整。
        if a >= 500 or (anchor >= 0.85 and a >= 100):
            mode = 'high_denom'
        elif a <= 10 and c <= 0.75:
            mode = 'low_denom'
        elif anchor >= 0.85 and c <= 0.6:
            mode = 'single_chip'
        elif c >= 1.0 or martin >= 1.5:
            mode = 'exact_combo'
        else:
            mode = 'balanced'

        # 2) 偏好籌碼數:精準湊數與高波動玩家稍多籌碼;單一面額或大額玩家較少籌碼。
        if mode == 'single_chip':
            preferred_chip_count = 1
        elif mode == 'high_denom':
            preferred_chip_count = 2
        elif mode == 'low_denom':
            preferred_chip_count = 2
        elif mode == 'exact_combo':
            preferred_chip_count = int(np.clip(round(2 + min(c, 2.5)), 2, 5))
        else:
            preferred_chip_count = 3

        # 3) 面額權重:以平均下注額附近的面額為中心,再依 mode 偏向大/小面額。
        # log 距離可避免 1 與 1000 的尺度差讓權重失真。
        center = max(float(a), 1.0)
        log_distance = np.abs(np.log10(denoms) - np.log10(center))
        weights = np.exp(-1.4 * log_distance)

        if mode == 'high_denom':
            weights *= np.linspace(0.45, 1.8, len(denoms))
        elif mode == 'low_denom':
            weights *= np.linspace(1.8, 0.45, len(denoms))
        elif mode == 'single_chip':
            # 單一籌碼玩家更集中在最接近 avg bet 的面額。
            nearest_idx = int(np.argmin(np.abs(denoms - center)))
            weights *= 0.35
            weights[nearest_idx] += 2.0
        elif mode == 'exact_combo':
            # 精準湊數玩家保留小面額權重,方便模擬器湊出零頭。
            weights *= np.array([1.6, 1.35, 1.15, 1.0, 0.9, 0.75, 0.65])

        weights = weights / weights.sum()

        modes.append(mode)
        preferred_counts.append(preferred_chip_count)
        weight_rows.append(json.dumps([round(float(x), 4) for x in weights]))

    return (
        pd.Series(modes, index=user_agg.index, name='prior_bet_denomination_mode'),
        pd.Series(preferred_counts, index=user_agg.index, name='prior_preferred_chip_count'),
        pd.Series(weight_rows, index=user_agg.index, name='prior_chip_denomination_weights'),
        pd.Series('synthetic_prior_from_amount_only', index=user_agg.index, name='chip_dna_source'),
    )

def derive_prior_cashout(user_agg):
    """
    從跨遊戲穩定的人格特徵推估玩家對新遊戲 CASHOUT 機制的先驗行為。

    直覺:
      - Martingale 高 (凹單性格)  → 傾向繼續闖關 → 低 cashout 機率、高停車關卡
      - Win Retrench < 1 (大贏減注)→ 見好就收性格   → 高 cashout 機率、低停車關卡
      - Take Profit Multi 高 (貪心) → 想多賺一點    → 低 cashout 機率、高停車關卡
      - Stop Loss Multi 高 (抗壓)  → 不怕風險       → 低 cashout 機率

    回傳兩個欄位:
      - prior_cashout_propensity:每關按下 cashout 的傾向 (0~1)
      - prior_cashout_stop_level:預期會撐到第幾關才落袋 (1~5)

    ⚠️ 這是「透明可解釋」的先驗公式,不是學習出來的模型。
       新遊戲上線後,應該用真實 cashout 行為重新校準權重,或直接用觀察值覆寫。
    """
    def z_norm(s):
        # ⚠️ 必須排除觀光客，只用活躍玩家來計算 mean 與 std，否則會被 3 萬個預設值嚴重稀釋
        active_mask = user_agg['is_active_for_clustering'] == True
        active_s = s[active_mask]
        
        mean = active_s.mean()
        std = active_s.std()
        
        if std == 0 or pd.isna(std):
            return pd.Series(0, index=s.index)
        return (s - mean) / std

    z_martin = z_norm(user_agg['trait_martingale_multiplier'])
    z_retrench = z_norm(user_agg['trait_win_retrench_ratio'])
    z_take = z_norm(user_agg['trait_session_take_profit_multi'])
    z_stop = z_norm(user_agg['trait_session_stop_loss_multi'])

    # retrench < 1 代表減注 → 見好就收性格 → 拉高 cashout
    # 為了直覺一致,把 retrench 反轉:減注的人 retrench_inverted 數值高
    retrench_inverted = -z_retrench

    # 加權公式 (權重來自直覺,非學習):正係數 = 拉高 cashout 傾向
    score = (
        + 0.35 * retrench_inverted   # 見好就收 → 想 cashout
        - 0.30 * z_martin            # 凹單性格 → 不想 cashout
        - 0.25 * z_take              # 貪心     → 不想 cashout
        - 0.10 * z_stop              # 抗壓     → 不想 cashout
    )

    # 用 sigmoid 把分數映射到 0.1 ~ 0.9 的 cashout 傾向
    propensity = 1.0 / (1.0 + np.exp(-score))
    propensity = 0.1 + 0.8 * propensity

    # 停車關卡:傾向越低代表越撐,假設線性對映到 1 ~ 5 關
    stop_level = np.round(1 + (1 - propensity) * 4).astype(int).clip(1, 5)

    # 針對觀光客，打散到 1~3 層 (因為觀光客通常不會撐太久，且需要隨機性避免過度集中)
    casual_mask = user_agg['is_active_for_clustering'] == False
    rng = np.random.default_rng(42)  # 使用固定 seed 確保每次執行結果一致
    stop_level.loc[casual_mask] = rng.integers(1, 4, size=casual_mask.sum())

    return propensity.round(4), stop_level


# ====================================================================
# Section 7 — 合成欄位 synthetic_*
# (純 placeholder,等真實資料覆蓋)
# ====================================================================

def add_synthetic_fields(user_agg, seed=42):
    """加入完全合成的欄位,並用固定 seed 確保可重現。"""
    rng = np.random.default_rng(seed)
    n = len(user_agg)
    user_agg['synthetic_wakeup_minute'] = rng.integers(0, 60, size=n)
    user_agg['synthetic_bonus_risk_prob'] = rng.choice([0.1, 0.5, 0.9], size=n)
    return user_agg


# ====================================================================
# Section 8 — Persona 分群
# (改用跨遊戲穩定的「人格特徵」做分群,而非下注金額)
# ====================================================================

# 特徵 → 描述詞對照表
# key: (feature_name, 'high' / 'low')
# value: 中文形容詞、英文形容詞、語意描述
TRAIT_DESCRIPTORS = {
    ('trait_martingale_multiplier', 'high'): {
        'zh': '凹單', 'en': 'Martingaler',
        'desc': '連輸後傾向放大注額追回'
    },
    ('trait_martingale_multiplier', 'low'): {
        'zh': '冷靜', 'en': 'CoolHeaded',
        'desc': '連輸後不會放大注額,情緒穩定'
    },
    ('trait_win_retrench_ratio', 'high'): {
        'zh': '乘勝追擊', 'en': 'PressTheWin',
        'desc': '大贏後反而加碼,試圖延續手氣'
    },
    ('trait_win_retrench_ratio', 'low'): {
        'zh': '見好就收', 'en': 'ProfitTaker',
        'desc': '大贏後減注守成,落袋為安'
    },
    ('trait_session_stop_loss_multi', 'high'): {
        'zh': '抗壓', 'en': 'Resilient',
        'desc': '能承受大額回撤不離場'
    },
    ('trait_session_stop_loss_multi', 'low'): {
        'zh': '謹慎', 'en': 'Cautious',
        'desc': '小幅虧損即離場,風險厭惡'
    },
    ('trait_session_take_profit_multi', 'high'): {
        'zh': '貪心', 'en': 'Greedy',
        'desc': '想累積更大獲利才願離場'
    },
    ('trait_session_take_profit_multi', 'low'): {
        'zh': '知足', 'en': 'Content',
        'desc': '小幅獲利即離場'
    },
    ('trait_micro_session_length', 'high'): {
        'zh': '馬拉松', 'en': 'Marathoner',
        'desc': '單次 session 連玩多局,持續性高'
    },
    ('trait_micro_session_length', 'low'): {
        'zh': '短打', 'en': 'Sprinter',
        'desc': '玩幾局就休息,碎片化遊玩'
    },
    ('trait_win_grid_stickiness', 'high'): {
        'zh': '迷信', 'en': 'Superstitious',
        'desc': '贏後傾向沿用相同格子'
    },
    ('trait_win_grid_stickiness', 'low'): {
        'zh': '靈活', 'en': 'Adaptive',
        'desc': '每局重新評估,不被前局結果牽制'
    },
}


def name_personas(persona_summary, threshold=0.5):
    """
    根據 K-Means 各 cluster 在人格特徵上的均值,自動產生語意名稱。

    流程:
      1. 在 cluster 之間做 z-normalize,找出每個 cluster 最突出 (|z| > threshold) 的特徵
      2. 取絕對值最大的 top-2 特徵
      3. 用 TRAIT_DESCRIPTORS 把「特徵 + 方向」轉成語意詞,組合成名稱與描述
      4. 若所有特徵的 |z| 都低於 threshold,標記為 'all_rounder' (全方位/平庸型)

    Args:
        persona_summary: DataFrame, index=cluster_id, columns=人格特徵欄位名
        threshold: cluster 間 z-score 的顯著閾值

    Returns:
        DataFrame, columns: cluster_id, persona_key, persona_name_zh, persona_name_en, persona_description
    """
    cluster_means = persona_summary.copy()
    cluster_std = cluster_means.std().replace(0, 1.0)
    feature_z = (cluster_means - cluster_means.mean()) / cluster_std

    rows = []
    for cluster_id in cluster_means.index:
        sig = feature_z.loc[cluster_id]

        # 篩選 |z| > threshold 的特徵,按絕對值排序取 top-2
        significant = sig[sig.abs() > threshold]
        top_features = significant.abs().sort_values(ascending=False).head(2).index.tolist()

        if not top_features:
            # 沒有顯著突出的特徵 → 全方位/平庸型
            persona_key = 'all_rounder'
            persona_name_zh = '全方位型'
            persona_name_en = 'AllRounder'
            persona_desc = '各項人格特徵均接近群體平均,無明顯行為偏好'
        else:
            zh_parts, en_parts, desc_parts = [], [], []
            for f in top_features:
                direction = 'high' if sig[f] > 0 else 'low'
                d = TRAIT_DESCRIPTORS.get((f, direction))
                if d:
                    zh_parts.append(d['zh'])
                    en_parts.append(d['en'])
                    desc_parts.append(d['desc'])

            if not zh_parts:
                # 萬一對照表沒覆蓋到 → fallback
                persona_key = 'unclassified'
                persona_name_zh = '未分類型'
                persona_name_en = 'Unclassified'
                persona_desc = '此 cluster 的突出特徵未在語意對照表中定義'
            else:
                persona_key = '_'.join(en_parts)
                persona_name_zh = ''.join(zh_parts) + '型'
                persona_name_en = ''.join(en_parts)
                persona_desc = ';'.join(desc_parts)

        rows.append({
            'cluster_id': cluster_id,
            'persona_key': persona_key,
            'persona_name_zh': persona_name_zh,
            'persona_name_en': persona_name_en,
            'persona_description': persona_desc,
        })

    return pd.DataFrame(rows)


def cluster_personas(user_agg, n_clusters=4, seed=42):
    """
    用 trait_* 特徵分群,讓 Persona 即使搬到新遊戲也保有意義。

    舊版用了 [avg_bet, coverage, bet_std, martingale],其中前三個全屬「下注規模」
    類別,等於分群高度被「玩家經濟能力」主導。
    新版改用「人格 + 節奏」特徵,Persona 更接近「玩家類型」而非「玩家階級」,
    並透過 name_personas() 自動產生語意命名,取代無語意的 Behavior_Type_N。

    註:本版不對 outlier 做特別處理。極端玩家若自成 1 人 cluster,
        視為「這個玩家獨一無二,沒有相似者」的有效訊息,予以保留。
    """
    print("\n🧠 正在進行 K-Means Persona 標籤化 (使用跨遊戲穩定特徵)...")

    cluster_features = [
        'trait_martingale_multiplier',
        'trait_win_retrench_ratio',
        'trait_session_stop_loss_multi',
        'trait_session_take_profit_multi',
        'trait_micro_session_length',
        'trait_win_grid_stickiness',
    ]

    active_mask = user_agg['is_active_for_clustering'] == True
    
    X = user_agg.loc[active_mask, cluster_features].copy()
    X = X.fillna(X.median())

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=n_clusters, random_state=seed, n_init=10)
    user_agg.loc[active_mask, 'cluster_id'] = kmeans.fit_predict(X_scaled)
    user_agg.loc[~active_mask, 'cluster_id'] = -1

    persona_summary = (
        user_agg[active_mask].groupby('cluster_id')[cluster_features].mean().round(3)
    )

    # 自動語意命名
    persona_naming = name_personas(persona_summary)
    
    # 新增觀光客命名
    casual_naming = pd.DataFrame([{
        'cluster_id': -1,
        'persona_key': 'persona_casual_tourist',
        'persona_name_zh': '觀光客 (Casual)',
        'persona_name_en': 'Casual Tourist',
        'persona_description': '總遊戲局數少於 30 局，偶爾出現的輕度過客。'
    }])
    persona_naming = pd.concat([persona_naming, casual_naming], ignore_index=True)

    print("\n📛 Persona 自動命名結果:")
    for _, r in persona_naming.iterrows():
        print(f"   Cluster {r['cluster_id']}: {r['persona_name_zh']} / {r['persona_name_en']}")
        print(f"     └─ {r['persona_description']}")

    user_agg = pd.merge(user_agg, persona_naming, on='cluster_id', how='left')
    user_agg['player_persona'] = user_agg['persona_key']

    print("\n📊 各 Persona 的人格特徵均值:")
    print(persona_summary)

    return user_agg, persona_summary, persona_naming


# ====================================================================
# Section 9 — 主流程
# ====================================================================

def extract_real_agents_dna(data_dir, min_rounds=30, grid_neighbor_map=None):
    """主流程:從舊遊戲資料萃取每位玩家對新遊戲的 DNA。"""
    print("🚀 啟動跨遊戲遷移 DNA 萃取引擎 v2...\n")

    df = load_raw_bets(data_dir)
    if df is None:
        return None

    df, active_accounts, casual_accounts = split_active_players(df, min_rounds)
    if df.empty:
        return None

    # 單局聚合
    round_agg = aggregate_by_round(df)

    # 萃取 traits + observed
    traits_results = extract_traits(round_agg)
    user_agg = aggregate_to_user(round_agg, traits_results)
    
    user_agg['is_active_for_clustering'] = user_agg['Account'].isin(active_accounts)

    # 讀取並整合 VIP 資料 (Milestone 5.5)
    vip_csv_path = os.path.join(data_dir, '..', 'PlayerData', 'PlayerData.csv')
    if os.path.exists(vip_csv_path):
        print(f"💎 正在整合 VIP 分群資料: {vip_csv_path}")
        vip_df = pd.read_csv(vip_csv_path)
        
        # 確保總押注額為數值
        if '總押注額' in vip_df.columns:
            vip_df['總押注額'] = pd.to_numeric(vip_df['總押注額'], errors='coerce').fillna(0)
            
            # 定義 VIP 判斷邏輯
            def get_vip_level(amt):
                if amt >= 10_000_000: return 'V8'
                if amt >= 6_000_000:  return 'V7'
                if amt >= 3_000_000:  return 'V6'
                if amt >= 600_000:    return 'V5'
                if amt >= 60_000:     return 'V4'
                if amt >= 6_000:      return 'V3'
                if amt >= 3_000:      return 'V2'
                return 'V1'
                
            vip_df['VIP_Group'] = vip_df['總押注額'].apply(get_vip_level)
            
            # 只取 Account 與 VIP_Group，並與 user_agg 合併
            vip_map = vip_df[['Account', 'VIP_Group']].drop_duplicates(subset=['Account'])
            user_agg = pd.merge(user_agg, vip_map, on='Account', how='left')
            # 若資料中沒有該 Account 的 VIP_Group，預設為 V1
            user_agg['VIP_Group'] = user_agg['VIP_Group'].fillna('V1')
            print(f"💎 VIP 整合完成。V8: {(user_agg['VIP_Group'] == 'V8').sum()}, V1: {(user_agg['VIP_Group'] == 'V1').sum()}")
        else:
            print("⚠️ VIP 資料中未找到 '總押注額' 欄位，全部預設為 V1")
            user_agg['VIP_Group'] = 'V1'
    else:
        print(f"⚠️ 找不到 VIP 資料 ({vip_csv_path})，全部預設為 V1")
        user_agg['VIP_Group'] = 'V1'

    # 時間/頻次特徵 (v2.1):24 小時活躍向量、每日上線機率、每日 session 數
    total_obs_days = df['Date'].nunique()
    print(f"📅 資料觀察窗口共涵蓋 {total_obs_days} 天。")
    if total_obs_days < 14:
        print(f"⚠️  觀察窗口較短 (<14 天),trait_daily_login_probability 的可信度有限。")
    temporal = extract_temporal_patterns(round_agg, total_obs_days)
    for d in [temporal['hourly_df'], temporal['login_df'], temporal['sessions_df']]:
        user_agg = pd.merge(user_agg, d, on='Account', how='left')

    # 舊遊戲格子偏好 → 新遊戲先驗
    old_grid_probs = extract_old_grid_preferences(df)
    prior_grid_df = derive_prior_grid_preferences_9(
        old_grid_probs, neighbor_map=grid_neighbor_map
    )
    user_agg = pd.merge(user_agg, prior_grid_df, on='Account', how='left')

    # 9 格目標格數先驗
    user_agg['prior_target_grids_9'] = derive_prior_target_grids(user_agg)

    # EXBET → Lightning 購買先驗
    extra_affinity, buy_lightning_prob, buy_lightning_source = derive_prior_buy_lightning(user_agg)
    user_agg['trait_extra_feature_affinity'] = extra_affinity
    user_agg['prior_buy_lightning_prob'] = buy_lightning_prob
    user_agg['buy_lightning_source'] = buy_lightning_source

    # 下注面額偏好 DNA:模擬器用來把 raw bet amount 轉成合法面額組合
    denom_mode, preferred_chip_count, chip_weights, chip_source = derive_bet_denomination_preferences(user_agg)
    user_agg['prior_bet_denomination_mode'] = denom_mode
    user_agg['prior_preferred_chip_count'] = preferred_chip_count
    user_agg['prior_chip_denomination_weights'] = chip_weights
    user_agg['chip_dna_source'] = chip_source
    user_agg['available_bet_denominations'] = json.dumps(BET_DENOMINATIONS)

    # CASHOUT 先驗
    propensity, stop_level = derive_prior_cashout(user_agg)
    user_agg['prior_cashout_propensity'] = propensity
    user_agg['prior_cashout_stop_level'] = stop_level

    # 合成欄位
    user_agg = add_synthetic_fields(user_agg)

    # Persona 分群
    user_agg, persona_summary, persona_naming = cluster_personas(user_agg)

    return user_agg, persona_summary, persona_naming


# ====================================================================
# Section 10 — 輸出格式化
# ====================================================================

def export_full(df, prefix):
    """完整輸出,保留所有前綴欄位,給工程除錯與下游校準用。"""
    csv_path = f'{prefix}_full_{len(df)}.csv'
    json_path = f'{prefix}_full_{len(df)}.json'
    df.to_csv(csv_path, index=False)
    df.to_json(json_path, orient='records', force_ascii=False, indent=4)
    return csv_path, json_path


def export_frontend_spec(df, prefix):
    """
    對齊前端 Antigravity Spec 的精簡輸出。
    這個版本拿掉前綴,以保持與前端規格的相容性,但
    新遊戲上線後,前端應改讀 export_full 的版本以利校準。
    """
    spec_df = pd.DataFrame({
        'Account':                    df['Account'],
        'Player_Persona':             df['player_persona'],
        'Persona_Name_ZH':            df['persona_name_zh'],
        'Persona_Name_EN':            df['persona_name_en'],
        'Persona_Description':        df['persona_description'],
        'VIP_Group':                  df['VIP_Group'],
        'Primary_Play_Hour':          df['trait_primary_play_hour'],
        'Hourly_Activity_Vector':     df['trait_hourly_activity_vector'],
        'Daily_Login_Probability':    df['trait_daily_login_probability'].round(4),
        'Sessions_Per_Active_Day':    df['trait_sessions_per_active_day'].round(2),
        'Wakeup_Minute':              df['synthetic_wakeup_minute'],
        'Daily_Session_Length':       df['trait_daily_session_length'],
        'Micro_Session_Length':       np.round(df['trait_micro_session_length']).astype(int),
        'Break_Duration_Minutes':     np.round(df['trait_break_duration_minutes']).astype(int),
        'Avg_Bet_Amount':             df['observed_avg_bet'],
        'Bet_Amount_Std':             df['observed_bet_std'],
        'Available_Bet_Denominations': df['available_bet_denominations'],
        'Chip_DNA_Source':            df['chip_dna_source'],
        # Backward-compatible aliases for the simulator/frontend.
        # These are priors, not observed chip-click behavior.
        'Bet_Denomination_Mode':      df['prior_bet_denomination_mode'],
        'Preferred_Chip_Count':       df['prior_preferred_chip_count'],
        'Chip_Denomination_Weights':  df['prior_chip_denomination_weights'],
        # Explicit names for downstream systems that want provenance in the field name.
        'Prior_Bet_Denomination_Mode':     df['prior_bet_denomination_mode'],
        'Prior_Preferred_Chip_Count':      df['prior_preferred_chip_count'],
        'Prior_Chip_Denomination_Weights': df['prior_chip_denomination_weights'],
        'LiveMines_Target_Grids':     df['prior_target_grids_9'],
        'Grid_Count_Std':             df['observed_grid_count_std'],
        'Bet_Distribution_Type':      df['trait_bet_distribution_type'],
        'Anchor_Bet_Ratio':           df['trait_anchor_bet_ratio'],
        'Win_Grid_Stickiness':        df['trait_win_grid_stickiness'],
        'Buy_Lightning_Prob':         df['prior_buy_lightning_prob'],
        'Cashout_Propensity':         df['prior_cashout_propensity'],
        'Cashout_Stop_Level':         df['prior_cashout_stop_level'],
        'Session_Stop_Loss_Multi':    df['trait_session_stop_loss_multi'],
        'Session_Take_Profit_Multi':  df['trait_session_take_profit_multi'],
        'LiveMines_Bonus_Risk_Prob':  df['synthetic_bonus_risk_prob'],
        'Martingale_Multiplier':      df['trait_martingale_multiplier'],
        'Win_Retrench_Ratio':         df['trait_win_retrench_ratio'],
        'Grid_Preferences':           df['prior_grid_preferences_9'],
    })

    csv_path = f'{prefix}_spec_{len(spec_df)}.csv'
    json_path = f'{prefix}_spec_{len(spec_df)}.json'
    spec_df.to_csv(csv_path, index=False)
    spec_df.to_json(json_path, orient='records', force_ascii=False, indent=4)
    return csv_path, json_path


# ====================================================================
# Entry point
# ====================================================================

if __name__ == "__main__":
    try:
        result = extract_real_agents_dna('./data', min_rounds=30)

        if result is None:
            print("\n⚠️ 未發現有效資料或符合條件的玩家數為 0。")
        else:
            df, persona_summary, persona_naming = result

            prefix = "LiveMines_Agent_DNA_v2_5_5levels_lightning_chipprior"
            full_csv, full_json = export_full(df, prefix)
            spec_csv, spec_json = export_frontend_spec(df, prefix)

            print(f"\n✅ 成功匯出 {len(df)} 位玩家的 DNA!")
            print(f"📄 完整版 (含 observed_/trait_/prior_/synthetic_ 前綴):")
            print(f"   - {full_csv}")
            print(f"   - {full_json}")
            print(f"📄 前端規格版 (對齊 Antigravity Spec):")
            print(f"   - {spec_csv}")
            print(f"   - {spec_json}")

            print("\n📊 Persona 分佈狀況:")
            print(df['player_persona'].value_counts())

            print("\n💡 提示:新遊戲上線後,請優先用真實資料覆寫以下欄位:")
            print("   - prior_grid_preferences_9   → observed_grid_preferences_9")
            print("   - prior_buy_lightning_prob   → observed_buy_lightning_prob")
            print("   - prior_cashout_propensity   → observed_cashout_propensity")
            print("   - prior_cashout_stop_level   → observed_cashout_stop_level")
            print("   - prior_bet_denomination_mode / prior_chip_denomination_weights")
            print("     目前是 synthetic_prior_from_amount_only,不是 observed chip clickstream")
            print("     → observed_bet_denomination_mode / observed_chip_denomination_weights")
            print("   - synthetic_bonus_risk_prob  → observed_bonus_risk_prob")

    except ModuleNotFoundError as e:
        print(f"\n❌ 缺少必要的資料科學套件: {e}")
        print("👉 請執行: pip install pandas numpy scikit-learn scipy")
    except Exception as e:
        print(f"\n❌ 程式執行過程中發生嚴重錯誤:\n{e}")
        raise