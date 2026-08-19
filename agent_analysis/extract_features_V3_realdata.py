# -*- coding: utf-8 -*-
"""
====================================================================
LiveMines Agent DNA 萃取引擎 V3 — 真實上線數據版
====================================================================

資料來源: agent_analysis/Realdata/bill_records_*.csv (LEMS 正式注單匯出)
輸出:     agent_analysis/DNA_v3_real/

與 V2 (LKDB 跨遊戲推測版) 的差異 — 推測欄位全面換成真實觀察:
  ✅ Grid_Preferences      : 注單本身就是 9 格 → 直接統計 (不再 6→9 擴散)
  ✅ Buy_Lightning_Prob    : Bet Place=10 為閃電加購單 → 真實購買率
  ✅ Cashout_Stop_Level    : BGLevel1~5 欄位記錄逐層 Continue/Bomb/CashOut → 真實收手行為
  ✅ Cashout_Propensity    : 過關後選擇 CashOut 的真實比例
  ✅ LiveMines_Target_Grids: 每局實際押幾格 → 直接統計
  🔒 Daily_Login_Probability: 依 PM 決策固定 1.0 (資料窗口過短，先假設每天登入)
  🔧 籌碼面額 DNA           : 維持合成先驗 (無籌碼 clickstream，與 V2 同款演算法)
  💎 VIP_Group             : 由注單總投注額 (含加購費) 套用絕對門檻。
                             資料窗口短 → 多數 V1，隨資料累積自然修正。

資料清理:
  - 以 Bill No 去重 (RD 已知匯出 bug: 同一注單可能出現兩筆)
  - 多個 bill_records_*.csv 自動合併 (之後定期匯出直接丟進 Realdata 即可)
====================================================================
"""
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')  # Windows cp950 主控台印 emoji 用

import pandas as pd
import numpy as np
import glob
import os
import json
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

GRID_COUNT = 9
LIGHTNING_BET_PLACE = 10                       # Bet Place=10 = 閃電加購單
BET_DENOMINATIONS = [5, 10, 50, 100, 500, 1000, 10000]
MIN_ROUNDS_ACTIVE = 30                         # 活躍玩家門檻 (低於此 = 觀光客)
BREAK_MINUTES = 15                             # 間隔超過此分鐘數視為 session break
SEED = 42

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Realdata')
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'DNA_v3_real')


# ====================================================================
# Section 1 — 載入與清理
# ====================================================================

def load_bills():
    # 支援兩種命名: bill_records_*.csv (舊) 與 YYYYMMDD_LEMS.csv (每日匯出)
    files = sorted(glob.glob(os.path.join(DATA_DIR, 'bill_records_*.csv')))
    files += sorted(f for f in glob.glob(os.path.join(DATA_DIR, '*_LEMS.csv'))
                    if not os.path.basename(f).startswith('game_results'))
    if not files:
        print(f"❌ {DATA_DIR} 找不到注單檔 (bill_records_*.csv 或 *_LEMS.csv)")
        return None
    dfs = []
    for f in files:
        d = pd.read_csv(f, low_memory=False, index_col=False, on_bad_lines='skip')
        dfs.append(d)
        print(f"📂 {os.path.basename(f)}: {len(d)} 筆")
    df = pd.concat(dfs, ignore_index=True)

    # 以 Bill No 去重 (RD 匯出 bug + 多檔重疊匯出)
    before = len(df)
    df = df.drop_duplicates(subset=['Bill No'], keep='first')
    print(f"🧹 Bill No 去重: {before} → {len(df)} (移除 {before - len(df)} 筆)")

    df['Bill Time'] = pd.to_datetime(df['Bill Time'].astype(str), errors='coerce')
    for col in ['Bet Amount', 'Payout', 'Member Win/Loss', 'JP Win']:
        df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', ''), errors='coerce')
    df['Bet Place'] = pd.to_numeric(df['Bet Place'], errors='coerce')

    df = df[df['Bill Time'].notna() & df['Bet Amount'].notna() & df['Bet Place'].notna()].copy()
    df['Bet Place'] = df['Bet Place'].astype(int)
    df['Net_Profit'] = df['Member Win/Loss']
    df['Date'] = df['Bill Time'].dt.strftime('%Y%m%d')

    span = (df['Bill Time'].max() - df['Bill Time'].min())
    print(f"✅ 合併後 {len(df)} 筆有效注單，{df['Account'].nunique()} 個帳號，"
          f"{df['Game Code'].nunique()} 局，時間範圍 {df['Bill Time'].min()} ~ {df['Bill Time'].max()} "
          f"(約 {span.total_seconds()/3600:.1f} 小時)")
    return df


# ====================================================================
# Section 2 — 單局聚合 (主注單與加購單分流)
# ====================================================================

def aggregate_by_round(df):
    main = df[df['Bet Place'].between(1, GRID_COUNT)]
    extra = df[df['Bet Place'] == LIGHTNING_BET_PLACE]
    extra_rounds = set(zip(extra['Account'], extra['Game Code']))

    round_agg = main.groupby(['Account', 'Date', 'Game Code']).agg(
        Bill_Time=('Bill Time', 'first'),
        Total_Bet_Amount=('Bet Amount', 'sum'),
        Max_Bet_Amount=('Bet Amount', 'max'),
        Main_Net_Profit=('Net_Profit', 'sum'),
        Bet_Count=('Bet Place', 'nunique'),
        Bet_Places_List=('Bet Place', lambda x: list(set(x))),
    ).reset_index()

    # 該局是否加購閃電 (真實觀察)，以及加購費計入淨損益
    round_agg['Lightning_Purchased'] = [
        1 if (a, g) in extra_rounds else 0
        for a, g in zip(round_agg['Account'], round_agg['Game Code'])
    ]
    extra_pnl = extra.groupby(['Account', 'Game Code'])['Net_Profit'].sum()
    round_agg['Net_Profit'] = round_agg['Main_Net_Profit'] + [
        extra_pnl.get((a, g), 0.0)
        for a, g in zip(round_agg['Account'], round_agg['Game Code'])
    ]

    round_agg['Max_Bet_Ratio'] = round_agg['Max_Bet_Amount'] / round_agg['Total_Bet_Amount']
    round_agg = round_agg.sort_values(by=['Account', 'Bill_Time']).reset_index(drop=True)
    return round_agg


# ====================================================================
# Section 3 — 人格特徵 trait_* (演算法沿用 V2，資料換成真實 9 格注單)
# ====================================================================

def extract_traits(round_agg):
    round_agg['Prev_Bet_Places'] = round_agg.groupby(['Account', 'Date'])['Bet_Places_List'].shift(1)
    round_agg['Prev_Net_Profit'] = round_agg.groupby(['Account', 'Date'])['Net_Profit'].shift(1)

    def calc_stickiness(row):
        if (pd.notna(row['Prev_Net_Profit']) and row['Prev_Net_Profit'] > 0
                and isinstance(row['Prev_Bet_Places'], list)):
            prev_set = set(row['Prev_Bet_Places'])
            curr_set = set(row['Bet_Places_List'])
            if not prev_set:
                return np.nan
            return len(curr_set.intersection(prev_set)) / len(prev_set)
        return np.nan

    round_agg['Stickiness'] = round_agg.apply(calc_stickiness, axis=1)
    stickiness_df = round_agg.groupby('Account')['Stickiness'].mean().reset_index(
        name='trait_win_grid_stickiness')

    round_agg['Next_Bet_Amount'] = round_agg.groupby('Account')['Total_Bet_Amount'].shift(-1)
    round_agg['Bet_Change_Ratio'] = (round_agg['Next_Bet_Amount'] / round_agg['Total_Bet_Amount']) \
        .replace([np.inf, -np.inf], np.nan)

    is_win_or_tie = round_agg['Net_Profit'] >= 0
    loss_blocks = is_win_or_tie.cumsum()
    round_agg['Loss_Streak'] = round_agg.groupby(['Account', loss_blocks]).cumcount()
    martingale_df = round_agg[round_agg['Loss_Streak'] >= 2].groupby('Account')['Bet_Change_Ratio'] \
        .mean().reset_index(name='trait_martingale_multiplier')

    round_agg['Is_Big_Win'] = round_agg['Net_Profit'] >= (round_agg['Total_Bet_Amount'] * 2)
    win_retrench_df = round_agg[round_agg['Is_Big_Win']].groupby('Account')['Bet_Change_Ratio'] \
        .mean().reset_index(name='trait_win_retrench_ratio')

    round_agg['Time_Since_Last_Bet'] = round_agg.groupby('Account')['Bill_Time'] \
        .diff().dt.total_seconds() / 60.0
    break_mask = round_agg['Time_Since_Last_Bet'] > BREAK_MINUTES
    break_durations = round_agg[break_mask].groupby('Account')['Time_Since_Last_Bet'] \
        .mean().reset_index(name='trait_break_duration_minutes')
    break_counts = round_agg[break_mask].groupby('Account').size().reset_index(name='Break_Count')

    round_agg['Cumulative_PnL'] = round_agg.groupby(['Account', 'Date'])['Net_Profit'].cumsum()
    daily_extremes = round_agg.groupby(['Account', 'Date']).agg(
        Daily_Min_PnL=('Cumulative_PnL', 'min'),
        Daily_Max_PnL=('Cumulative_PnL', 'max'),
    ).reset_index()
    session_extremes = daily_extremes.groupby('Account').agg(
        Typical_Max_Drawdown=('Daily_Min_PnL', 'median'),
        Typical_Peak_Profit=('Daily_Max_PnL', 'median'),
    ).reset_index()

    return (round_agg, stickiness_df, martingale_df, win_retrench_df,
            break_durations, break_counts, session_extremes)


# ====================================================================
# Section 3.5 — 時間特徵 (每日登入率依 PM 決策固定 1.0)
# ====================================================================

def extract_temporal_patterns(round_agg):
    tmp = round_agg.copy()
    tmp['hour'] = tmp['Bill_Time'].dt.hour
    hourly_counts = tmp.groupby(['Account', 'hour']).size().unstack(fill_value=0)
    for h in range(24):
        if h not in hourly_counts.columns:
            hourly_counts[h] = 0
    hourly_counts = hourly_counts[list(range(24))]
    hourly_normalized = hourly_counts.div(hourly_counts.sum(axis=1), axis=0).fillna(1.0 / 24)
    hourly_df = hourly_normalized.apply(
        lambda row: json.dumps([round(float(x), 4) for x in row.values]), axis=1,
    ).reset_index(name='trait_hourly_activity_vector')

    active_days = round_agg.groupby('Account')['Date'].nunique()
    break_counts = (round_agg['Time_Since_Last_Bet'] > BREAK_MINUTES) \
        .groupby(round_agg['Account']).sum().rename('break_count')
    sessions_per_day = ((break_counts + 1) / active_days).clip(lower=1.0)
    sessions_df = sessions_per_day.reset_index(name='trait_sessions_per_active_day')

    return hourly_df, sessions_df


# ====================================================================
# Section 4 — user-level 聚合
# ====================================================================

def aggregate_to_user(round_agg, traits_results):
    (round_agg, stickiness_df, martingale_df, win_retrench_df,
     break_durations, break_counts, session_extremes) = traits_results

    user_agg = round_agg.groupby('Account').agg(
        observed_total_rounds=('Game Code', 'count'),
        observed_active_days=('Date', 'nunique'),
        trait_primary_play_hour=(
            'Bill_Time', lambda x: int(x.dt.hour.mode()[0]) if not x.empty else 20),
        observed_avg_bet=('Total_Bet_Amount', 'mean'),
        observed_bet_std=('Total_Bet_Amount', 'std'),
        observed_avg_target_grids=('Bet_Count', 'mean'),
        observed_grid_count_std=('Bet_Count', 'std'),
        observed_avg_max_bet_ratio=('Max_Bet_Ratio', 'mean'),
        observed_buy_lightning_prob=('Lightning_Purchased', 'mean'),  # ✅ 真實購買率
    ).reset_index()

    user_agg['trait_daily_session_length'] = (
        user_agg['observed_total_rounds'] / user_agg['observed_active_days']).astype(int)

    for d in [martingale_df, win_retrench_df, break_durations, break_counts,
              session_extremes, stickiness_df]:
        user_agg = pd.merge(user_agg, d, on='Account', how='left')

    user_agg['Break_Count'] = user_agg['Break_Count'].fillna(0)
    user_agg['trait_micro_session_length'] = (
        user_agg['observed_total_rounds']
        / (user_agg['Break_Count'] + user_agg['observed_active_days']))

    avg_bet_safe = user_agg['observed_avg_bet'].replace(0, 1)
    user_agg['trait_session_stop_loss_multi'] = (
        np.abs(user_agg['Typical_Max_Drawdown']) / avg_bet_safe).fillna(20)
    user_agg['trait_session_take_profit_multi'] = (
        user_agg['Typical_Peak_Profit'] / avg_bet_safe).fillna(30)

    user_agg = user_agg.fillna(value={
        'observed_bet_std': 0,
        'observed_grid_count_std': 0,
        'trait_martingale_multiplier': 1.0,
        'trait_win_retrench_ratio': 1.0,
        'trait_win_grid_stickiness': 0.5,
        'trait_break_duration_minutes': 30.0,
    })

    user_agg['trait_martingale_multiplier'] = user_agg['trait_martingale_multiplier'].clip(1.0, 10.0)
    user_agg['trait_session_stop_loss_multi'] = user_agg['trait_session_stop_loss_multi'].clip(lower=5.0)
    user_agg['trait_session_take_profit_multi'] = user_agg['trait_session_take_profit_multi'].clip(lower=5.0)
    user_agg['trait_micro_session_length'] = user_agg['trait_micro_session_length'].clip(lower=1)

    user_agg['trait_bet_distribution_type'] = np.where(
        user_agg['observed_avg_max_bet_ratio'] >= 0.6, 'anchor', 'equal')
    user_agg['trait_anchor_bet_ratio'] = user_agg['observed_avg_max_bet_ratio'].clip(0.5, 0.95)

    # 目標格數: 真實 9 格統計 (不再由覆蓋率推估)
    user_agg['observed_target_grids_9'] = np.round(
        user_agg['observed_avg_target_grids']).astype(int).clip(1, GRID_COUNT)

    return user_agg


# ====================================================================
# Section 5 — 真實 9 格偏好 (取代 V2 的 6→9 先驗擴散)
# ====================================================================

def extract_grid_preferences_9(df):
    main = df[df['Bet Place'].between(1, GRID_COUNT)]
    grid_counts = main.groupby(['Account', 'Bet Place']).size().unstack(fill_value=0)
    for g in range(1, GRID_COUNT + 1):
        if g not in grid_counts.columns:
            grid_counts[g] = 0
    grid_counts = grid_counts[list(range(1, GRID_COUNT + 1))]
    grid_probs = grid_counts.div(grid_counts.sum(axis=1), axis=0).fillna(1.0 / GRID_COUNT)
    return grid_probs.apply(
        lambda row: json.dumps([round(float(x), 4) for x in row.values]), axis=1,
    ).reset_index(name='observed_grid_preferences_9')


# ====================================================================
# Section 6 — 真實 CASHOUT 行為 (取代 V2 的性格先驗)
# ====================================================================

def extract_cashout_behavior(df):
    """
    解析 BGLevel1~5 ("Manual,選格,Continue/Bomb/CashOut")。

    - observed_cashout_propensity: 每次「過關後」選擇 CashOut 的比例
        分母 = CashOut 次數 + Continue 次數 (過關才有選擇權；Bomb 不列入)
    - observed_cashout_stop_level: 玩家傾向收手的層數
        有 CashOut 紀錄 → 取中位數
        僅有 Bomb 紀錄   → min(炸掉層的中位數 + 1, 5)  (右設限: 至少想撐過該層)
    """
    bg_rows = df[df['BGLevel1'].notna() & (df['BGLevel1'].astype(str) != '')]
    records = []
    for _, r in bg_rows.iterrows():
        for lvl in range(1, 6):
            v = r.get(f'BGLevel{lvl}')
            if pd.isna(v) or str(v).strip() == '':
                break
            outcome = str(v).split(',')[-1].strip()
            records.append({'Account': r['Account'], 'level': lvl, 'outcome': outcome})
    if not records:
        return pd.DataFrame(columns=['Account', 'observed_cashout_propensity',
                                     'observed_cashout_stop_level', 'observed_bg_samples'])
    rec = pd.DataFrame(records)

    def per_user(g):
        cashouts = g[g['outcome'] == 'CashOut']
        continues = g[g['outcome'] == 'Continue']
        bombs = g[g['outcome'] == 'Bomb']
        decided = len(cashouts) + len(continues)
        propensity = len(cashouts) / decided if decided > 0 else np.nan
        if len(cashouts) > 0:
            stop_level = int(np.clip(round(cashouts['level'].median()), 1, 5))
        elif len(bombs) > 0:
            stop_level = int(np.clip(round(bombs['level'].median()) + 1, 1, 5))
        else:
            stop_level = np.nan
        return pd.Series({
            'observed_cashout_propensity': propensity,
            'observed_cashout_stop_level': stop_level,
            'observed_bg_samples': len(g['level'].groupby(level=0)) if False else len(g),
        })

    out = rec.groupby('Account').apply(per_user, include_groups=False).reset_index()
    return out


def derive_prior_cashout_fallback(user_agg):
    """沒有 BG 紀錄的玩家 → 沿用 V2 的性格先驗公式 (透明可解釋，非學習模型)。"""
    def z_norm(s):
        active_mask = user_agg['is_active_for_clustering'] == True
        active_s = s[active_mask]
        mean, std = active_s.mean(), active_s.std()
        if std == 0 or pd.isna(std):
            return pd.Series(0, index=s.index)
        return (s - mean) / std

    z_martin = z_norm(user_agg['trait_martingale_multiplier'])
    z_retrench = z_norm(user_agg['trait_win_retrench_ratio'])
    z_take = z_norm(user_agg['trait_session_take_profit_multi'])
    z_stop = z_norm(user_agg['trait_session_stop_loss_multi'])

    score = (+ 0.35 * (-z_retrench) - 0.30 * z_martin - 0.25 * z_take - 0.10 * z_stop)
    propensity = 0.1 + 0.8 * (1.0 / (1.0 + np.exp(-score)))
    stop_level = np.round(1 + (1 - propensity) * 4).clip(1, 5)

    casual_mask = user_agg['is_active_for_clustering'] == False
    rng = np.random.default_rng(SEED)
    stop_level_arr = stop_level.to_numpy().astype(int)
    stop_level_arr[casual_mask.to_numpy()] = rng.integers(1, 4, size=int(casual_mask.sum()))
    return propensity.round(4), pd.Series(stop_level_arr, index=user_agg.index)


# ====================================================================
# Section 7 — 籌碼面額合成先驗 (與 V2 同款演算法，依 PM 決策保留)
# ====================================================================

def derive_bet_denomination_preferences(user_agg):
    avg_bet = pd.to_numeric(user_agg['observed_avg_bet'], errors='coerce').fillna(0)
    bet_std = pd.to_numeric(user_agg['observed_bet_std'], errors='coerce').fillna(0)
    anchor_ratio = pd.to_numeric(user_agg['trait_anchor_bet_ratio'], errors='coerce').fillna(0.5)
    martingale = pd.to_numeric(user_agg['trait_martingale_multiplier'], errors='coerce').fillna(1.0)
    cv = (bet_std / avg_bet.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0)

    modes, preferred_counts, weight_rows = [], [], []
    denoms = np.array(BET_DENOMINATIONS, dtype=float)

    for a, c, anchor, martin in zip(avg_bet, cv, anchor_ratio, martingale):
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

        if mode == 'single_chip':
            preferred_chip_count = 1
        elif mode in ('high_denom', 'low_denom'):
            preferred_chip_count = 2
        elif mode == 'exact_combo':
            preferred_chip_count = int(np.clip(round(2 + min(c, 2.5)), 2, 5))
        else:
            preferred_chip_count = 3

        center = max(float(a), 1.0)
        log_distance = np.abs(np.log10(denoms) - np.log10(center))
        weights = np.exp(-1.4 * log_distance)
        if mode == 'high_denom':
            weights *= np.linspace(0.45, 1.8, len(denoms))
        elif mode == 'low_denom':
            weights *= np.linspace(1.8, 0.45, len(denoms))
        elif mode == 'single_chip':
            nearest_idx = int(np.argmin(np.abs(denoms - center)))
            weights *= 0.35
            weights[nearest_idx] += 2.0
        elif mode == 'exact_combo':
            weights *= np.array([1.6, 1.35, 1.15, 1.0, 0.9, 0.75, 0.65])
        weights = weights / weights.sum()

        modes.append(mode)
        preferred_counts.append(preferred_chip_count)
        weight_rows.append(json.dumps([round(float(x), 4) for x in weights]))

    return (
        pd.Series(modes, index=user_agg.index),
        pd.Series(preferred_counts, index=user_agg.index),
        pd.Series(weight_rows, index=user_agg.index),
    )


# ====================================================================
# Section 8 — VIP 分群 (由注單總投注額直接計算)
# ====================================================================

def derive_vip_group(df):
    total_bet = df.groupby('Account')['Bet Amount'].sum()  # 含加購費 = turnover 口徑

    def get_vip_level(amt):
        if amt >= 10_000_000: return 'V8'
        if amt >= 6_000_000:  return 'V7'
        if amt >= 3_000_000:  return 'V6'
        if amt >= 600_000:    return 'V5'
        if amt >= 60_000:     return 'V4'
        if amt >= 6_000:      return 'V3'
        if amt >= 3_000:      return 'V2'
        return 'V1'

    return total_bet.apply(get_vip_level).reset_index().rename(
        columns={'Bet Amount': 'observed_total_turnover', 0: 'VIP_Group'}) \
        .rename(columns={'Bet Amount': 'VIP_Group'}) if False else \
        pd.DataFrame({'Account': total_bet.index,
                      'observed_total_turnover': total_bet.values,
                      'VIP_Group': total_bet.apply(get_vip_level).values})


# ====================================================================
# Section 9 — Persona 分群 (演算法與 V2 相同)
# ====================================================================

TRAIT_DESCRIPTORS = {
    ('trait_martingale_multiplier', 'high'): {'zh': '凹單', 'en': 'Martingaler', 'desc': '連輸後傾向放大注額追回'},
    ('trait_martingale_multiplier', 'low'): {'zh': '冷靜', 'en': 'CoolHeaded', 'desc': '連輸後不會放大注額,情緒穩定'},
    ('trait_win_retrench_ratio', 'high'): {'zh': '乘勝追擊', 'en': 'PressTheWin', 'desc': '大贏後反而加碼,試圖延續手氣'},
    ('trait_win_retrench_ratio', 'low'): {'zh': '見好就收', 'en': 'ProfitTaker', 'desc': '大贏後減注守成,落袋為安'},
    ('trait_session_stop_loss_multi', 'high'): {'zh': '抗壓', 'en': 'Resilient', 'desc': '能承受大額回撤不離場'},
    ('trait_session_stop_loss_multi', 'low'): {'zh': '謹慎', 'en': 'Cautious', 'desc': '小幅虧損即離場,風險厭惡'},
    ('trait_session_take_profit_multi', 'high'): {'zh': '貪心', 'en': 'Greedy', 'desc': '想累積更大獲利才願離場'},
    ('trait_session_take_profit_multi', 'low'): {'zh': '知足', 'en': 'Content', 'desc': '小幅獲利即離場'},
    ('trait_micro_session_length', 'high'): {'zh': '馬拉松', 'en': 'Marathoner', 'desc': '單次 session 連玩多局,持續性高'},
    ('trait_micro_session_length', 'low'): {'zh': '短打', 'en': 'Sprinter', 'desc': '玩幾局就休息,碎片化遊玩'},
    ('trait_win_grid_stickiness', 'high'): {'zh': '迷信', 'en': 'Superstitious', 'desc': '贏後傾向沿用相同格子'},
    ('trait_win_grid_stickiness', 'low'): {'zh': '靈活', 'en': 'Adaptive', 'desc': '每局重新評估,不被前局結果牽制'},
}


def name_personas(persona_summary, threshold=0.5):
    cluster_means = persona_summary.copy()
    cluster_std = cluster_means.std().replace(0, 1.0)
    feature_z = (cluster_means - cluster_means.mean()) / cluster_std

    rows = []
    for cluster_id in cluster_means.index:
        sig = feature_z.loc[cluster_id]
        significant = sig[sig.abs() > threshold]
        top_features = significant.abs().sort_values(ascending=False).head(2).index.tolist()
        if not top_features:
            rows.append({'cluster_id': cluster_id, 'persona_key': 'all_rounder',
                         'persona_name_zh': '全方位型', 'persona_name_en': 'AllRounder',
                         'persona_description': '各項人格特徵均接近群體平均,無明顯行為偏好'})
            continue
        zh, en, desc = [], [], []
        for f in top_features:
            d = TRAIT_DESCRIPTORS.get((f, 'high' if sig[f] > 0 else 'low'))
            if d:
                zh.append(d['zh']); en.append(d['en']); desc.append(d['desc'])
        if not zh:
            rows.append({'cluster_id': cluster_id, 'persona_key': 'unclassified',
                         'persona_name_zh': '未分類型', 'persona_name_en': 'Unclassified',
                         'persona_description': '此 cluster 的突出特徵未在語意對照表中定義'})
        else:
            rows.append({'cluster_id': cluster_id, 'persona_key': '_'.join(en),
                         'persona_name_zh': ''.join(zh) + '型', 'persona_name_en': ''.join(en),
                         'persona_description': ';'.join(desc)})
    return pd.DataFrame(rows)


def cluster_personas(user_agg, n_clusters=4):
    print("\n🧠 K-Means Persona 分群 (跨遊戲穩定特徵)...")
    cluster_features = [
        'trait_martingale_multiplier', 'trait_win_retrench_ratio',
        'trait_session_stop_loss_multi', 'trait_session_take_profit_multi',
        'trait_micro_session_length', 'trait_win_grid_stickiness',
    ]
    active_mask = user_agg['is_active_for_clustering'] == True
    X = user_agg.loc[active_mask, cluster_features].fillna(
        user_agg.loc[active_mask, cluster_features].median())
    X_scaled = StandardScaler().fit_transform(X)
    kmeans = KMeans(n_clusters=n_clusters, random_state=SEED, n_init=10)
    user_agg.loc[active_mask, 'cluster_id'] = kmeans.fit_predict(X_scaled)
    user_agg.loc[~active_mask, 'cluster_id'] = -1

    persona_summary = user_agg[active_mask].groupby('cluster_id')[cluster_features].mean().round(3)
    persona_naming = name_personas(persona_summary)
    persona_naming = pd.concat([persona_naming, pd.DataFrame([{
        'cluster_id': -1, 'persona_key': 'persona_casual_tourist',
        'persona_name_zh': '觀光客 (Casual)', 'persona_name_en': 'Casual Tourist',
        'persona_description': f'總遊戲局數少於 {MIN_ROUNDS_ACTIVE} 局，偶爾出現的輕度過客。'
    }])], ignore_index=True)

    for _, r in persona_naming.iterrows():
        print(f"   Cluster {r['cluster_id']}: {r['persona_name_zh']} / {r['persona_name_en']}")

    user_agg = pd.merge(user_agg, persona_naming, on='cluster_id', how='left')
    user_agg['player_persona'] = user_agg['persona_key']
    return user_agg, persona_summary, persona_naming


# ====================================================================
# Section 10 — 主流程與輸出
# ====================================================================

def main():
    print("🚀 LiveMines DNA 萃取引擎 V3 (真實上線數據版)\n")
    df = load_bills()
    if df is None:
        return

    account_counts = df[df['Bet Place'].between(1, GRID_COUNT)] \
        .groupby('Account')['Game Code'].nunique()
    active_accounts = account_counts[account_counts >= MIN_ROUNDS_ACTIVE].index
    print(f"🎯 活躍玩家 (≥{MIN_ROUNDS_ACTIVE} 局): {len(active_accounts)}；"
          f"觀光客: {(account_counts < MIN_ROUNDS_ACTIVE).sum()}")

    round_agg = aggregate_by_round(df)
    traits_results = extract_traits(round_agg)
    user_agg = aggregate_to_user(round_agg, traits_results)
    user_agg['is_active_for_clustering'] = user_agg['Account'].isin(active_accounts)

    # 時間特徵
    hourly_df, sessions_df = extract_temporal_patterns(round_agg)
    user_agg = pd.merge(user_agg, hourly_df, on='Account', how='left')
    user_agg = pd.merge(user_agg, sessions_df, on='Account', how='left')

    # 每日登入率: 觀察窗 ≥ 4 天時用真實值 (活躍天數 ÷ 觀察天數)，
    # 資料太短時依 PM 決策固定 1.0 (短窗會嚴重高估登入率)
    total_obs_days = df['Date'].nunique()
    if total_obs_days >= 4:
        user_agg['trait_daily_login_probability'] = (
            user_agg['observed_active_days'] / total_obs_days
        ).clip(upper=1.0).round(4)
        print(f"📅 觀察窗 {total_obs_days} 天 ≥ 4 → 每日登入率使用真實值 "
              f"(平均 {user_agg['trait_daily_login_probability'].mean():.3f})")
    else:
        user_agg['trait_daily_login_probability'] = 1.0
        print(f"📅 觀察窗僅 {total_obs_days} 天 < 4 → 每日登入率固定 1.0 (PM 決策)")

    # 真實 9 格偏好
    user_agg = pd.merge(user_agg, extract_grid_preferences_9(df), on='Account', how='left')

    # 真實 CASHOUT 行為 + 無樣本者退回性格先驗
    cashout_df = extract_cashout_behavior(df)
    user_agg = pd.merge(user_agg, cashout_df, on='Account', how='left')
    prior_prop, prior_stop = derive_prior_cashout_fallback(user_agg)
    has_bg = user_agg['observed_cashout_propensity'].notna()
    user_agg['cashout_propensity_final'] = user_agg['observed_cashout_propensity'].where(has_bg, prior_prop)
    has_stop = user_agg['observed_cashout_stop_level'].notna()
    user_agg['cashout_stop_level_final'] = user_agg['observed_cashout_stop_level'].where(has_stop, prior_stop).astype(int)
    user_agg['cashout_source'] = np.where(has_bg, 'observed_bg_record', 'prior_personality')
    print(f"🎰 CASHOUT 來源: 真實 BG 紀錄 {has_bg.sum()} 人 / 性格先驗 {(~has_bg).sum()} 人")

    # 籌碼合成先驗 (PM 決策保留)
    denom_mode, chip_count, chip_weights = derive_bet_denomination_preferences(user_agg)
    user_agg['prior_bet_denomination_mode'] = denom_mode
    user_agg['prior_preferred_chip_count'] = chip_count
    user_agg['prior_chip_denomination_weights'] = chip_weights

    # VIP (注單總投注額直接計算)
    user_agg = pd.merge(user_agg, derive_vip_group(df), on='Account', how='left')
    vip_dist = user_agg['VIP_Group'].value_counts().to_dict()
    print(f"💎 VIP 分佈: {dict(sorted(vip_dist.items()))}")

    # 合成欄位
    rng = np.random.default_rng(SEED)
    user_agg['synthetic_wakeup_minute'] = rng.integers(0, 60, size=len(user_agg))
    user_agg['synthetic_bonus_risk_prob'] = rng.choice([0.1, 0.5, 0.9], size=len(user_agg))

    # Persona
    user_agg, persona_summary, persona_naming = cluster_personas(user_agg)

    # ---- 輸出 (spec 欄位與 V2 完全同構，模擬器直接可用) ----
    df_out = user_agg
    spec_df = pd.DataFrame({
        'Account':                    df_out['Account'],
        'Player_Persona':             df_out['player_persona'],
        'Persona_Name_ZH':            df_out['persona_name_zh'],
        'Persona_Name_EN':            df_out['persona_name_en'],
        'Persona_Description':        df_out['persona_description'],
        'VIP_Group':                  df_out['VIP_Group'],
        'Primary_Play_Hour':          df_out['trait_primary_play_hour'],
        'Hourly_Activity_Vector':     df_out['trait_hourly_activity_vector'],
        'Daily_Login_Probability':    df_out['trait_daily_login_probability'],
        'Sessions_Per_Active_Day':    df_out['trait_sessions_per_active_day'].round(2),
        'Wakeup_Minute':              df_out['synthetic_wakeup_minute'],
        'Daily_Session_Length':       df_out['trait_daily_session_length'],
        'Micro_Session_Length':       np.round(df_out['trait_micro_session_length']).astype(int),
        'Break_Duration_Minutes':     np.round(df_out['trait_break_duration_minutes']).astype(int),
        'Avg_Bet_Amount':             df_out['observed_avg_bet'],
        'Bet_Amount_Std':             df_out['observed_bet_std'],
        'Available_Bet_Denominations': json.dumps(BET_DENOMINATIONS),
        'Chip_DNA_Source':            'synthetic_prior_from_amount_only',
        'Bet_Denomination_Mode':      df_out['prior_bet_denomination_mode'],
        'Preferred_Chip_Count':       df_out['prior_preferred_chip_count'],
        'Chip_Denomination_Weights':  df_out['prior_chip_denomination_weights'],
        'Prior_Bet_Denomination_Mode':     df_out['prior_bet_denomination_mode'],
        'Prior_Preferred_Chip_Count':      df_out['prior_preferred_chip_count'],
        'Prior_Chip_Denomination_Weights': df_out['prior_chip_denomination_weights'],
        'LiveMines_Target_Grids':     df_out['observed_target_grids_9'],
        'Grid_Count_Std':             df_out['observed_grid_count_std'],
        'Bet_Distribution_Type':      df_out['trait_bet_distribution_type'],
        'Anchor_Bet_Ratio':           df_out['trait_anchor_bet_ratio'],
        'Win_Grid_Stickiness':        df_out['trait_win_grid_stickiness'],
        'Buy_Lightning_Prob':         df_out['observed_buy_lightning_prob'].round(4),
        'Cashout_Propensity':         df_out['cashout_propensity_final'],
        'Cashout_Stop_Level':         df_out['cashout_stop_level_final'],
        'Session_Stop_Loss_Multi':    df_out['trait_session_stop_loss_multi'],
        'Session_Take_Profit_Multi':  df_out['trait_session_take_profit_multi'],
        'LiveMines_Bonus_Risk_Prob':  df_out['synthetic_bonus_risk_prob'],
        'Martingale_Multiplier':      df_out['trait_martingale_multiplier'],
        'Win_Retrench_Ratio':         df_out['trait_win_retrench_ratio'],
        'Grid_Preferences':           df_out['observed_grid_preferences_9'],
        # V3 新增溯源欄位 (模擬器忽略，供人工核對)
        'Cashout_Source':             df_out['cashout_source'],
        'Observed_Total_Rounds':      df_out['observed_total_rounds'],
        'Observed_Total_Turnover':    df_out['observed_total_turnover'].round(2),
    })

    os.makedirs(OUT_DIR, exist_ok=True)
    prefix = os.path.join(OUT_DIR, 'LiveMines_Agent_DNA_v3_realdata')
    df_out.to_csv(f'{prefix}_full_{len(df_out)}.csv', index=False)
    spec_df.to_csv(f'{prefix}_spec_{len(spec_df)}.csv', index=False)
    spec_df.to_json(f'{prefix}_spec_{len(spec_df)}.json', orient='records', force_ascii=False, indent=4)

    print(f"\n✅ 成功匯出 {len(spec_df)} 位玩家的 V3 真實 DNA → {OUT_DIR}")
    print("📊 Persona 分佈:")
    print(df_out['persona_name_zh'].value_counts().to_string())


if __name__ == '__main__':
    main()
