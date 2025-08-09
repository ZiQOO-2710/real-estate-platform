import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Typography,
  Box
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Home as HomeIcon,
  Map as MapIcon,
  Analytics as AnalyticsIcon,
  Timeline as TimelineIcon,
  AdminPanelSettings
} from '@mui/icons-material'

const drawerWidth = 240

const menuItems = [
  { text: '대시보드', icon: <DashboardIcon />, path: '/' },
  { text: '지도 보기', icon: <MapIcon />, path: '/map' },
  { text: '관리자 모드', icon: <AdminPanelSettings />, path: '/admin', isAdmin: true },
  { text: '통계 분석', icon: <AnalyticsIcon />, path: '/analytics' },
  { text: '트렌드', icon: <TimelineIcon />, path: '/trends' }
]

const Navigation = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavigation = (path) => {
    navigate(path)
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: '#1a1a2e',
          color: 'white',
          borderRight: '1px solid rgba(255, 255, 255, 0.12)',
        },
      }}
    >
      <Toolbar />
      
      <Box sx={{ overflow: 'auto' }}>
        {/* 로고/제목 섹션 */}
        <Box sx={{ p: 2, textAlign: 'center', bgcolor: '#16213e', mb: 2 }}>
          <HomeIcon sx={{ fontSize: 40, color: '#64b5f6', mb: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#64b5f6' }}>
            부동산 플랫폼
          </Typography>
          <Typography variant="caption" sx={{ color: '#90a4ae' }}>
            데이터 분석 및 관리
          </Typography>
        </Box>
        
        {/* 메뉴 섹션 */}
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ mb: 1, color: '#90a4ae', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.75rem' }}>
            메인 메뉴
          </Typography>
        </Box>
        
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path || (item.path === '/admin' && location.pathname.startsWith('/admin'))}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  mx: 2,
                  borderRadius: 2,
                  ...(item.isAdmin && {
                    bgcolor: 'rgba(100, 181, 246, 0.15)',
                    border: '1px solid rgba(100, 181, 246, 0.3)',
                    '&:hover': {
                      bgcolor: 'rgba(100, 181, 246, 0.25)',
                    }
                  }),
                  ...(!item.isAdmin && {
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.08)',
                    }
                  }),
                  '&.Mui-selected': {
                    backgroundColor: item.isAdmin ? '#64b5f6' : 'rgba(100, 181, 246, 0.15)',
                    borderRight: '3px solid #64b5f6',
                    color: 'white',
                    '&:hover': {
                      backgroundColor: item.isAdmin ? '#42a5f5' : 'rgba(100, 181, 246, 0.25)',
                    },
                    '& .MuiListItemIcon-root': {
                      color: item.isAdmin ? 'white' : '#64b5f6',
                    },
                  },
                }}
              >
                <ListItemIcon 
                  sx={{ 
                    color: item.isAdmin ? '#64b5f6' : '#90a4ae',
                    minWidth: 40
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    color: item.isAdmin ? '#64b5f6' : '#e0e0e0',
                    fontWeight: item.isAdmin ? 'bold' : 'normal'
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        {/* 데이터 요약 */}
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            데이터 현황
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">단지 수</Typography>
              <Typography variant="body2" fontWeight="bold">1,430</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">매물 수</Typography>
              <Typography variant="body2" fontWeight="bold">40K+</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">거래 기록</Typography>
              <Typography variant="body2" fontWeight="bold">977K+</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Drawer>
  )
}

export default Navigation