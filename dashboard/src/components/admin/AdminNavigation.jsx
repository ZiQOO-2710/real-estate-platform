import React from 'react'
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Collapse,
  Chip
} from '@mui/material'
import {
  Dashboard,
  Analytics,
  Web,
  Schedule,
  Article,
  Storage,
  Backup,
  Verified,
  Group,
  Security,
  History,
  Settings,
  Notifications,
  Api,
  ExpandLess,
  ExpandMore,
  AdminPanelSettings
} from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'

const drawerWidth = 280

// 아이콘 매핑
const iconMap = {
  Dashboard,
  Analytics,
  Web,
  Schedule,
  Article,
  Storage,
  Backup,
  Verified,
  Group,
  Security,
  History,
  Settings,
  Notifications,
  Api
}

// 네비게이션 구조
const adminSections = [
  {
    title: "대시보드",
    items: [
      { name: "시스템 개요", path: "/admin", icon: "Dashboard" },
      { name: "실시간 모니터링", path: "/admin/monitoring", icon: "Analytics" }
    ]
  },
  {
    title: "크롤링 관리",
    items: [
      { name: "크롤러 상태", path: "/admin/crawlers", icon: "Web", badge: "실행중" },
      { name: "스케줄 관리", path: "/admin/schedule", icon: "Schedule" },
      { name: "크롤링 로그", path: "/admin/logs", icon: "Article", badge: "새로움" }
    ]
  },
  {
    title: "데이터 관리",
    items: [
      { name: "데이터베이스", path: "/admin/database", icon: "Storage" },
      { name: "백업/복원", path: "/admin/backup", icon: "Backup" },
      { name: "데이터 검증", path: "/admin/validation", icon: "Verified" }
    ]
  },
  {
    title: "사용자 관리",
    items: [
      { name: "사용자 목록", path: "/admin/users", icon: "Group" },
      { name: "접근 권한", path: "/admin/permissions", icon: "Security" },
      { name: "활동 로그", path: "/admin/activity", icon: "History" }
    ]
  },
  {
    title: "시스템 설정",
    items: [
      { name: "환경 설정", path: "/admin/settings", icon: "Settings" },
      { name: "알림 설정", path: "/admin/notifications", icon: "Notifications" },
      { name: "API 관리", path: "/admin/api", icon: "Api" }
    ]
  }
]

function AdminNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedSections, setExpandedSections] = React.useState(new Set(['대시보드', '크롤링 관리']))

  const handleSectionToggle = (sectionTitle) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionTitle)) {
      newExpanded.delete(sectionTitle)
    } else {
      newExpanded.add(sectionTitle)
    }
    setExpandedSections(newExpanded)
  }

  const handleNavigate = (path) => {
    navigate(path)
  }

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: '#1a1a2e',
          color: 'white',
          borderRight: '1px solid rgba(255, 255, 255, 0.12)',
          marginTop: '64px' // AppBar 높이만큼 조정
        },
      }}
    >
      {/* 어드민 헤더 */}
      <Box sx={{ p: 2, textAlign: 'center', bgcolor: '#16213e' }}>
        <AdminPanelSettings sx={{ fontSize: 40, color: '#64b5f6', mb: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#64b5f6' }}>
          관리자 패널
        </Typography>
        <Typography variant="caption" sx={{ color: '#90a4ae' }}>
          시스템 관리 및 모니터링
        </Typography>
      </Box>

      <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.12)' }} />

      {/* 네비게이션 섹션들 */}
      <List sx={{ p: 0 }}>
        {adminSections.map((section, sectionIndex) => (
          <React.Fragment key={section.title}>
            {/* 섹션 헤더 */}
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => handleSectionToggle(section.title)}
                sx={{
                  py: 1.5,
                  px: 2,
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.08)'
                  }
                }}
              >
                <ListItemText 
                  primary={section.title}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    color: '#90a4ae',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                />
                {expandedSections.has(section.title) ? 
                  <ExpandLess sx={{ color: '#90a4ae' }} /> : 
                  <ExpandMore sx={{ color: '#90a4ae' }} />
                }
              </ListItemButton>
            </ListItem>

            {/* 섹션 아이템들 */}
            <Collapse in={expandedSections.has(section.title)} timeout="auto" unmountOnExit>
              <List disablePadding>
                {section.items.map((item) => {
                  const IconComponent = iconMap[item.icon]
                  const active = isActive(item.path)
                  
                  return (
                    <ListItem key={item.path} disablePadding>
                      <ListItemButton
                        onClick={() => handleNavigate(item.path)}
                        sx={{
                          pl: 3,
                          py: 1,
                          bgcolor: active ? 'rgba(100, 181, 246, 0.15)' : 'transparent',
                          borderRight: active ? '3px solid #64b5f6' : 'none',
                          '&:hover': {
                            bgcolor: active 
                              ? 'rgba(100, 181, 246, 0.25)' 
                              : 'rgba(255, 255, 255, 0.08)'
                          }
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <IconComponent 
                            sx={{ 
                              color: active ? '#64b5f6' : '#90a4ae',
                              fontSize: '1.25rem'
                            }} 
                          />
                        </ListItemIcon>
                        <ListItemText 
                          primary={item.name}
                          primaryTypographyProps={{
                            fontSize: '0.875rem',
                            color: active ? '#64b5f6' : '#e0e0e0',
                            fontWeight: active ? 'medium' : 'normal'
                          }}
                        />
                        {item.badge && (
                          <Chip
                            label={item.badge}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.6875rem',
                              bgcolor: item.badge === '실행중' ? '#4caf50' : '#ff9800',
                              color: 'white',
                              fontWeight: 'bold'
                            }}
                          />
                        )}
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </List>
            </Collapse>

            {sectionIndex < adminSections.length - 1 && (
              <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.08)', my: 0.5 }} />
            )}
          </React.Fragment>
        ))}
      </List>

      {/* 하단 상태 정보 */}
      <Box sx={{ mt: 'auto', p: 2, bgcolor: 'rgba(0, 0, 0, 0.2)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" sx={{ color: '#90a4ae' }}>
            시스템 상태
          </Typography>
          <Box 
            sx={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              bgcolor: '#4caf50',
              animation: 'pulse 2s infinite'
            }}
          />
        </Box>
        <Typography variant="caption" sx={{ color: '#e0e0e0', display: 'block' }}>
          마지막 업데이트: 방금 전
        </Typography>
      </Box>
    </Drawer>
  )
}

export default AdminNavigation