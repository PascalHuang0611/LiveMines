package main

import "testing"

func makePool() *Pool {
	c := &Config{}
	c.EgameData.InitialMainPool = 100000
	c.EgameData.InitialSubPool = 0
	c.EgameData.PoolPerCard = 0.005
	c.EgameData.FixPoolPerCard = 0.3
	c.EgameData.EgamePoolAdvance = 100000
	c.EgameData.InjectJPVal = 100000
	c.EgameData.InjectMax = 1000000
	c.EgameData.JackpotAutoInject = true
	return NewPool(c)
}

func TestPool_Contribute_SubNotFull(t *testing.T) {
	p := makePool()
	p.Contribute(10000) // totalRake = 50；mainRake = 15；subRake = 35
	if p.MainPool < 100015-0.01 || p.MainPool > 100015+0.01 {
		t.Errorf("MainPool 預期 100015 得 %f", p.MainPool)
	}
	if p.SubPool < 35-0.01 || p.SubPool > 35+0.01 {
		t.Errorf("SubPool 預期 35 得 %f", p.SubPool)
	}
}

func TestPool_Contribute_SubFull_AllToMain(t *testing.T) {
	p := makePool()
	p.SubPool = 100000  // 副池已滿
	p.Contribute(10000) // totalRake = 50 全進主池
	if p.MainPool != 100050 {
		t.Errorf("副池滿 → mainPool 預期 100050 得 %f", p.MainPool)
	}
	if p.SubPool != 100000 {
		t.Errorf("副池滿後不變 得 %f", p.SubPool)
	}
}

func TestPool_AutoInject_FillsMain(t *testing.T) {
	p := makePool()
	p.MainPool = 30000 // 缺 70000
	p.SubPool = 50000
	p.AutoInject()
	if p.MainPool != 100000 {
		t.Errorf("注資後 mainPool 應 100000 得 %f", p.MainPool)
	}
	if p.SubPool != -20000 {
		t.Errorf("subPool 應 50000-70000=-20000 得 %f", p.SubPool)
	}
	if p.AutoInjectEvents != 1 {
		t.Errorf("注資事件應 1 得 %d", p.AutoInjectEvents)
	}
}

func TestPool_GrandPrize_WeightedSplit(t *testing.T) {
	p := makePool()
	p.MainPool = 90000
	out := p.GrandPrizePayout1([]float64{1, 2, 3}) // 比例 1:2:3
	if len(out) != 3 {
		t.Fatalf("payout 數 3 得 %d", len(out))
	}
	want := []float64{15000, 30000, 45000}
	for i := range out {
		if out[i] != want[i] {
			t.Errorf("idx %d 預期 %f 得 %f", i, want[i], out[i])
		}
	}
	if p.MainPool != 0 {
		t.Errorf("主池應歸 0 得 %f", p.MainPool)
	}
}
