import React from 'react'
import { Box, AppBar, Toolbar, Typography, Avatar, Menu, MenuItem, Divider, Badge, IconButton } from '@mui/material'
import { Notifications, AccountCircle, ExitToApp, Settings, Dashboard as DashboardIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import AdminNavigation from './AdminNavigation'

function AdminLayout({ children }) {
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = React.useState(null)
  const [notificationCount] = React.useState(3)

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleBackToDashboard = () => {
    navigate('/')
  }

  const handleLogout = () => {
    // 로그아웃 로직
    console.log('로그아웃')
    handleMenuClose()
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* 상단 앱바 */}
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: '#1a1a2e',
          backgroundImage: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
        }}
      >
        <Toolbar>
          {/* 로고 및 제목 */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                '&:hover': { opacity: 0.8 }
              }}
              onClick={handleBackToDashboard}
            >
              <DashboardIcon sx={{ color: '#64b5f6' }} />
              <Box>
                <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', lineHeight: 1 }}>
                  부동산 플랫폼
                </Typography>
                <Typography variant="caption" sx={{ color: '#64b5f6', lineHeight: 1 }}>
                  관리자 모드
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* 우측 액션들 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* 알림 */}
            <IconButton color="inherit">
              <Badge badgeContent={notificationCount} color="error">
                <Notifications />
              </Badge>
            </IconButton>

            {/* 사용자 메뉴 */}
            <IconButton
              color="inherit"
              onClick={handleMenuOpen}
              sx={{ ml: 1 }}
            >
              <Avatar 
                sx={{ 
                  width: 32, 
                  height: 32, 
                  bgcolor: '#64b5f6',
                  fontSize: '0.875rem',
                  fontWeight: 'bold'
                }}
              >
                관리자
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{
                sx: { minWidth: 200, mt: 1 }
              }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  관리자
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  admin@realestate.com
                </Typography>
              </Box>
              
              <Divider />
              
              <MenuItem onClick={handleMenuClose}>
                <Settings sx={{ mr: 2 }} />
                계정 설정
              </MenuItem>
              
              <MenuItem onClick={handleBackToDashboard}>
                <DashboardIcon sx={{ mr: 2 }} />
                사용자 대시보드
              </MenuItem>
              
              <Divider />
              
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                <ExitToApp sx={{ mr: 2 }} />
                로그아웃
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* 사이드 네비게이션 */}
      <AdminNavigation />

      {/* 메인 콘텐츠 */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: '#f5f5f5',
          minHeight: '100vh',
          marginLeft: '280px', // AdminNavigation 너비
          paddingTop: '64px'   // AppBar 높이
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export default AdminLayout