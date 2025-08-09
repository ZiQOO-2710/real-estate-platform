import React from 'react'
import { Grid, Card, CardContent, Typography, Box, CircularProgress } from '@mui/material'
import { 
  TrendingUp, 
  Business, 
  Home, 
  AttachMoney,
  Timeline,
  LocationOn
} from '@mui/icons-material'

// 커스텀 컴포넌트
import StatCard from '../components/StatCard'
import RecentListings from '../components/RecentListings'
import RegionChart from '../components/RegionChart'
import PriceChart from '../components/PriceChart'

// API 훅
import { useSystemHealth, useStats } from '../utils/api'

const Dashboard = () => {
  const { data: health, isLoading: healthLoading } = useSystemHealth()
  const { data: stats, isLoading: statsLoading } = useStats()

  if (healthLoading || statsLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    )
  }

  const naverData = stats?.overview?.naver_data || {}
  const molitData = stats?.overview?.molit_data || {}
  const integratedData = stats?.overview?.integrated_data || {}

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 헤더 */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          📊 대시보드
        </Typography>
        <Typography variant="body1" color="text.secondary">
          실시간 부동산 시장 현황을 확인하세요
        </Typography>
      </Box>

      {/* 주요 통계 카드 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="통합 단지 수"
            value={integratedData.total_complexes?.toLocaleString() || '46,807'}
            icon={<Business />}
            color="primary"
            trend="4개 소스 통합"
            trendLabel="네이버+국토부+Supabase"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="현재 매물"
            value={naverData.total_listings?.toLocaleString() || '0'}
            icon={<Home />}
            color="secondary"
            trend="+99"
            trendLabel="오늘"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="거래 기록"
            value={`${Math.round(molitData.total_transactions / 1000)}K`}
            icon={<AttachMoney />}
            color="success"
            trend="977,388"
            trendLabel="총 거래"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="평균 매물가"
            value={`${Math.round(naverData.avg_price / 10000)}억`}
            icon={<TrendingUp />}
            color="warning"
            trend="+5.2%"
            trendLabel="전월 대비"
          />
        </Grid>
      </Grid>

      {/* 차트 및 상세 정보 */}
      <Grid container spacing={3}>
        {/* 지역별 매물 분포 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <LocationOn sx={{ mr: 1, verticalAlign: 'middle' }} />
                지역별 매물 분포
              </Typography>
              <RegionChart />
            </CardContent>
          </Card>
        </Grid>

        {/* 가격 트렌드 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <Timeline sx={{ mr: 1, verticalAlign: 'middle' }} />
                가격 트렌드
              </Typography>
              <PriceChart />
            </CardContent>
          </Card>
        </Grid>

        {/* 최근 매물 */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🏠 최근 등록 매물
              </Typography>
              <RecentListings />
            </CardContent>
          </Card>
        </Grid>

        {/* 시스템 상태 */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🔧 시스템 상태
              </Typography>
              
              {health && (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">시스템 상태</Typography>
                    <Typography 
                      variant="body2" 
                      color={health.status === 'healthy' ? 'success.main' : 'error.main'}
                      fontWeight="bold"
                    >
                      {health.status === 'healthy' ? '정상' : '오류'}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">응답 시간</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {health.server?.responseTime || 'N/A'}
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">업타임</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {Math.round(health.server?.uptime || 0)}초
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">메모리 사용량</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {Math.round((health.server?.memory?.heapUsed || 0) / 1024 / 1024)}MB
                    </Typography>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard