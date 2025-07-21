import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'

// 어드민 컴포넌트들
import AdminLayout from './components/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import CrawlerStatus from './pages/admin/CrawlerStatus'

// 어드민 전용 테마
const adminTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a1a2e',
      light: '#64b5f6',
      dark: '#0d47a1'
    },
    secondary: {
      main: '#64b5f6',
      light: '#90caf9',
      dark: '#42a5f5'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    },
    success: {
      main: '#4caf50'
    },
    warning: {
      main: '#ff9800'
    },
    error: {
      main: '#f44336'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Noto Sans KR", sans-serif',
    h4: {
      fontWeight: 700
    },
    h6: {
      fontWeight: 600
    }
  },
  components: {
    // 어드민 전용 컴포넌트 스타일 커스터마이징
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderRadius: 12,
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
          }
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600
        }
      }
    }
  }
})

function AdminApp() {
  return (
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      <AdminLayout>
        <Routes>
          {/* 어드민 대시보드 라우트들 */}
          <Route path="/" element={<AdminDashboard />} />
          <Route path="/monitoring" element={<AdminDashboard />} />
          
          {/* 크롤링 관리 */}
          <Route path="/crawlers" element={<CrawlerStatus />} />
          <Route path="/schedule" element={
            <div style={{ padding: '24px' }}>
              <h2>스케줄 관리</h2>
              <p>크롤링 스케줄 관리 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/logs" element={
            <div style={{ padding: '24px' }}>
              <h2>크롤링 로그</h2>
              <p>크롤링 로그 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          
          {/* 데이터 관리 */}
          <Route path="/database" element={
            <div style={{ padding: '24px' }}>
              <h2>데이터베이스 관리</h2>
              <p>데이터베이스 관리 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/backup" element={
            <div style={{ padding: '24px' }}>
              <h2>백업/복원</h2>
              <p>백업 및 복원 관리 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/validation" element={
            <div style={{ padding: '24px' }}>
              <h2>데이터 검증</h2>
              <p>데이터 검증 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          
          {/* 사용자 관리 */}
          <Route path="/users" element={
            <div style={{ padding: '24px' }}>
              <h2>사용자 관리</h2>
              <p>사용자 관리 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/permissions" element={
            <div style={{ padding: '24px' }}>
              <h2>접근 권한</h2>
              <p>접근 권한 관리 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/activity" element={
            <div style={{ padding: '24px' }}>
              <h2>활동 로그</h2>
              <p>사용자 활동 로그 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          
          {/* 시스템 설정 */}
          <Route path="/settings" element={
            <div style={{ padding: '24px' }}>
              <h2>환경 설정</h2>
              <p>시스템 환경 설정 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/notifications" element={
            <div style={{ padding: '24px' }}>
              <h2>알림 설정</h2>
              <p>알림 설정 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
          <Route path="/api" element={
            <div style={{ padding: '24px' }}>
              <h2>API 관리</h2>
              <p>API 관리 페이지가 여기에 구현됩니다.</p>
            </div>
          } />
        </Routes>
      </AdminLayout>
    </ThemeProvider>
  )
}

export default AdminApp