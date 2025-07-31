import React, { Suspense, memo } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Container, AppBar, Toolbar, Typography, Box, CircularProgress } from '@mui/material'
import { Home } from '@mui/icons-material'

// 컴포넌트 lazy loading으로 성능 최적화
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const ComplexList = React.lazy(() => import('./pages/ComplexList'))
const ListingList = React.lazy(() => import('./pages/ListingList'))
const MapView = React.lazy(() => import('./pages/MapView'))
const Navigation = React.lazy(() => import('./components/Navigation'))
const AdminApp = React.lazy(() => import('./AdminApp'))

// API 유틸리티
import { useSystemHealth } from './utils/api'

// 로딩 컴포넌트 최적화
const LoadingSpinner = memo(() => (
  <Box 
    display="flex" 
    justifyContent="center" 
    alignItems="center" 
    minHeight="200px"
    role="status" 
    aria-label="페이지 로딩 중"
  >
    <CircularProgress size={40} />
    <Typography variant="body2" sx={{ ml: 2, color: 'text.secondary' }}>
      로딩 중...
    </Typography>
  </Box>
))
LoadingSpinner.displayName = 'LoadingSpinner'

// 시스템 상태 컴포넌트 분리 및 최적화
const SystemStatus = memo(({ health }) => {
  if (!health) return null
  
  const isHealthy = health.status === 'healthy'
  
  return (
    <Box 
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      role="status"
      aria-label={`시스템 상태: ${isHealthy ? '정상' : '오류'}`}
    >
      <Box 
        sx={{ 
          width: 8, 
          height: 8, 
          borderRadius: '50%', 
          backgroundColor: isHealthy ? '#4caf50' : '#f44336',
          animation: isHealthy ? 'pulse 2s infinite' : 'none'
        }}
      />
      <Typography variant="body2" sx={{ color: 'white' }}>
        {isHealthy ? '정상' : '오류'}
      </Typography>
    </Box>
  )
})
SystemStatus.displayName = 'SystemStatus'

const App = memo(() => {
  const { data: health, isLoading } = useSystemHealth()

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: '#1a1a2e',
          backgroundImage: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
        }}
      >
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
            <Home sx={{ color: '#64b5f6' }} aria-hidden="true" />
            <Box>
              <Typography 
                variant="h6" 
                component="h1"
                sx={{ color: 'white', fontWeight: 'bold', lineHeight: 1 }}
              >
                부동산 플랫폼
              </Typography>
              <Typography 
                variant="caption" 
                component="p"
                sx={{ color: '#64b5f6', lineHeight: 1 }}
              >
                데이터 대시보드
              </Typography>
            </Box>
          </Box>
          
          <SystemStatus health={health} />
        </Toolbar>
      </AppBar>

      <Suspense fallback={<LoadingSpinner />}>
        <Navigation />
      </Suspense>

      <Box 
        component="main" 
        sx={{ flexGrow: 1, p: 3, marginTop: 8 }}
        role="main"
        aria-label="메인 콘텐츠"
      >
        <Container maxWidth="xl">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/complexes" element={<ComplexList />} />
              <Route path="/listings" element={<ListingList />} />
              <Route path="/map" element={<MapView />} />
              <Route path="/admin/*" element={<AdminApp />} />
            </Routes>
          </Suspense>
        </Container>
      </Box>
    </Box>
  )
})
App.displayName = 'App'

export default App