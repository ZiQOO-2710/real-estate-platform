import React from 'react'
import {
  Box,
  Grid,
  Typography,
  Paper,
  Alert,
  Tabs,
  Tab,
  Button,
  IconButton
} from '@mui/material'
import {
  PlayArrow,
  Stop,
  Settings,
  Notifications
} from '@mui/icons-material'
import StatusCard from '../../components/admin/StatusCard'
import MonitoringChart from '../../components/admin/MonitoringChart'

// 샘플 데이터
const systemData = [
  { time: '00:00', crawling: 120, api: 450, errors: 5 },
  { time: '01:00', crawling: 98, api: 380, errors: 3 },
  { time: '02:00', crawling: 156, api: 520, errors: 8 },
  { time: '03:00', crawling: 134, api: 490, errors: 2 },
  { time: '04:00', crawling: 178, api: 680, errors: 12 },
  { time: '05:00', crawling: 145, api: 590, errors: 6 }
]

const performanceData = [
  { time: '00:00', cpu: 45, memory: 68, disk: 32 },
  { time: '01:00', cpu: 52, memory: 71, disk: 34 },
  { time: '02:00', cpu: 38, memory: 65, disk: 31 },
  { time: '03:00', cpu: 61, memory: 74, disk: 35 },
  { time: '04:00', cpu: 47, memory: 69, disk: 33 },
  { time: '05:00', cpu: 55, memory: 72, disk: 36 }
]

function AdminDashboard() {
  const [tabValue, setTabValue] = React.useState(0)

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue)
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* 헤더 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
          시스템 관리 대시보드
        </Typography>
        <Typography variant="body1" color="text.secondary">
          부동산 크롤링 시스템의 전체 상태를 모니터링합니다
        </Typography>
      </Box>

      {/* 중요 알림 */}
      <Alert 
        severity="info" 
        sx={{ mb: 3 }}
        action={
          <Button size="small" startIcon={<Settings />}>
            설정
          </Button>
        }
      >
        크롤링 스케줄이 오전 2시에 자동 시작됩니다. VPN 연결 상태를 확인하세요.
      </Alert>

      {/* 시스템 상태 카드들 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="크롤러 상태"
            value="실행중"
            status="success"
            description="5개 워커가 활성화됨"
            progress={85}
            badge="온라인"
            onRefresh={() => console.log('크롤러 상태 새로고침')}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="처리된 매물"
            value="12,450"
            unit="개"
            status="info"
            description="최근 24시간"
            trend="up"
            trendValue="+15%"
            onRefresh={() => console.log('매물 통계 새로고침')}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="API 응답시간"
            value="156"
            unit="ms"
            status="warning"
            description="평균 응답 시간"
            trend="up"
            trendValue="+5ms"
            onRefresh={() => console.log('API 성능 새로고침')}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="시스템 오류"
            value="3"
            status="error"
            description="최근 1시간"
            trend="down"
            trendValue="-2"
            onRefresh={() => console.log('오류 현황 새로고침')}
          />
        </Grid>
      </Grid>

      {/* 탭 네비게이션 */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="시스템 활동" />
          <Tab label="성능 모니터링" />
          <Tab label="데이터베이스" />
          <Tab label="사용자 활동" />
        </Tabs>
      </Paper>

      {/* 탭 콘텐츠 */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {/* 크롤링 및 API 활동 */}
          <Grid item xs={12} md={8}>
            <MonitoringChart
              title="시스템 활동"
              subtitle="크롤링 및 API 요청 처리량"
              data={systemData}
              dataKeys={['crawling', 'api', 'errors']}
              colors={['#64b5f6', '#81c784', '#f06292']}
              height={350}
              realtime={true}
              onRefresh={() => console.log('시스템 활동 새로고침')}
              onTimeRangeChange={(range) => console.log('시간 범위:', range)}
              formatValue={(value) => `${value}개`}
            />
          </Grid>

          {/* 크롤러 제어 패널 */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Settings />
                크롤러 제어
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  현재 상태: 실행중 (5/8 워커)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={<Stop />}
                    color="error"
                    size="small"
                  >
                    중지
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Settings />}
                    size="small"
                  >
                    설정
                  </Button>
                </Box>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  VPN 상태
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box 
                    sx={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      bgcolor: '#4caf50'
                    }}
                  />
                  <Typography variant="body2">
                    WARP 연결됨 (104.28.x.x)
                  </Typography>
                </Box>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  최근 로그
                </Typography>
                <Box sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                  <div>[12:34] 크롤링 시작: 강남구</div>
                  <div>[12:33] VPN 연결 확인</div>
                  <div>[12:32] 데이터베이스 연결</div>
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tabValue === 1 && (
        <Grid container spacing={3}>
          {/* 시스템 성능 */}
          <Grid item xs={12}>
            <MonitoringChart
              title="시스템 성능"
              subtitle="CPU, 메모리, 디스크 사용률"
              data={performanceData}
              dataKeys={['cpu', 'memory', 'disk']}
              colors={['#ff6b6b', '#4ecdc4', '#45b7d1']}
              height={300}
              chartType="area"
              onRefresh={() => console.log('성능 데이터 새로고침')}
              formatValue={(value) => `${value}%`}
            />
          </Grid>
        </Grid>
      )}

      {tabValue === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <StatusCard
              title="데이터베이스 상태"
              value="정상"
              status="success"
              description="모든 연결이 활성화됨"
              progress={92}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <StatusCard
              title="저장된 매물"
              value="1,245,678"
              unit="개"
              status="info"
              description="전체 데이터"
              trend="up"
              trendValue="+12.4K"
            />
          </Grid>
        </Grid>
      )}

      {tabValue === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <StatusCard
              title="활성 사용자"
              value="24"
              status="success"
              description="현재 접속 중"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <StatusCard
              title="오늘 API 호출"
              value="45,678"
              unit="건"
              status="info"
              description="24시간 집계"
              trend="up"
              trendValue="+8%"
            />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}

export default AdminDashboard