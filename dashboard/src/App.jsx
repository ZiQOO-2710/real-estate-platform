import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Container, AppBar, Toolbar, Typography, Box } from '@mui/material'
import { Home, Business, Analytics, Map } from '@mui/icons-material'

// 페이지 컴포넌트
import Dashboard from './pages/Dashboard'
import ComplexList from './pages/ComplexList'
import ListingList from './pages/ListingList'
import MapView from './pages/MapView'
import Navigation from './components/Navigation'

// 어드민 앱
import AdminApp from './AdminApp'

// API 유틸리티
import { useSystemHealth } from './utils/api'

function App() {
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
            <Home sx={{ color: '#64b5f6' }} />
            <Box>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', lineHeight: 1 }}>
                부동산 플랫폼
              </Typography>
              <Typography variant="caption" sx={{ color: '#64b5f6', lineHeight: 1 }}>
                데이터 대시보드
              </Typography>
            </Box>
          </Box>
          
          {/* 시스템 상태 표시 */}
          {health && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box 
                sx={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  backgroundColor: health.status === 'healthy' ? '#4caf50' : '#f44336',
                  animation: health.status === 'healthy' ? 'pulse 2s infinite' : 'none'
                }}
              />
              <Typography variant="body2" sx={{ color: 'white' }}>
                {health.status === 'healthy' ? '정상' : '오류'}
              </Typography>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Navigation />

      <Box component="main" sx={{ flexGrow: 1, p: 3, marginTop: 8 }}>
        <Container maxWidth="xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/complexes" element={<ComplexList />} />
            <Route path="/listings" element={<ListingList />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/admin/*" element={<AdminApp />} />
          </Routes>
        </Container>
      </Box>
    </Box>
  )
}

export default App