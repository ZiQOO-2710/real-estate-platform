import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material'
import {
  Refresh,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  CheckCircle,
  Error,
  Warning,
  Info
} from '@mui/icons-material'

// 상태 타입별 색상과 아이콘
const statusConfig = {
  success: { color: '#4caf50', icon: CheckCircle, bgColor: 'rgba(76, 175, 80, 0.1)' },
  error: { color: '#f44336', icon: Error, bgColor: 'rgba(244, 67, 54, 0.1)' },
  warning: { color: '#ff9800', icon: Warning, bgColor: 'rgba(255, 152, 0, 0.1)' },
  info: { color: '#2196f3', icon: Info, bgColor: 'rgba(33, 150, 243, 0.1)' }
}

// 트렌드 타입별 아이콘
const trendConfig = {
  up: { icon: TrendingUp, color: '#4caf50' },
  down: { icon: TrendingDown, color: '#f44336' },
  flat: { icon: TrendingFlat, color: '#9e9e9e' }
}

function StatusCard({
  title,
  value,
  unit = '',
  status = 'info',
  description,
  progress,
  trend,
  trendValue,
  onRefresh,
  loading = false,
  badge,
  subtitle,
  children
}) {
  const theme = useTheme()
  const StatusIcon = statusConfig[status]?.icon || Info
  const TrendIcon = trend ? trendConfig[trend]?.icon : null

  return (
    <Card
      sx={{
        height: '100%',
        background: `linear-gradient(135deg, ${statusConfig[status].bgColor} 0%, transparent 50%)`,
        border: `1px solid ${statusConfig[status].color}20`,
        position: 'relative',
        overflow: 'visible',
        '&:hover': {
          boxShadow: theme.shadows[4],
          transform: 'translateY(-2px)',
          transition: 'all 0.3s ease-in-out'
        }
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* 헤더 */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <StatusIcon 
                sx={{ 
                  color: statusConfig[status].color, 
                  fontSize: '1.25rem'
                }} 
              />
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  color: 'text.secondary',
                  fontWeight: 'medium',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: '0.75rem'
                }}
              >
                {title}
              </Typography>
              {badge && (
                <Chip
                  label={badge}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.625rem',
                    bgcolor: statusConfig[status].color,
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                />
              )}
            </Box>
            {subtitle && (
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                {subtitle}
              </Typography>
            )}
          </Box>

          {onRefresh && (
            <Tooltip title="새로고침">
              <IconButton
                size="small"
                onClick={onRefresh}
                disabled={loading}
                sx={{
                  color: statusConfig[status].color,
                  '&:hover': {
                    bgcolor: `${statusConfig[status].color}15`
                  }
                }}
              >
                <Refresh 
                  sx={{ 
                    fontSize: '1.125rem',
                    animation: loading ? 'spin 1s linear infinite' : 'none'
                  }} 
                />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* 메인 값 */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 'bold',
              color: 'text.primary',
              fontFeatureSettings: '"tnum"'
            }}
          >
            {value}
          </Typography>
          {unit && (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', fontWeight: 'medium' }}
            >
              {unit}
            </Typography>
          )}
          {TrendIcon && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
              <TrendIcon 
                sx={{ 
                  fontSize: '1rem', 
                  color: trendConfig[trend].color 
                }} 
              />
              {trendValue && (
                <Typography
                  variant="caption"
                  sx={{
                    color: trendConfig[trend].color,
                    fontWeight: 'bold',
                    fontSize: '0.75rem'
                  }}
                >
                  {trendValue}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* 설명 */}
        {description && (
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              mb: progress !== undefined ? 1 : 0,
              lineHeight: 1.4
            }}
          >
            {description}
          </Typography>
        )}

        {/* 진행률 표시 */}
        {progress !== undefined && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                진행률
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 'medium' }}>
                {progress}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'rgba(0,0,0,0.1)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 3,
                  bgcolor: statusConfig[status].color
                }
              }}
            />
          </Box>
        )}

        {/* 커스텀 콘텐츠 */}
        {children && (
          <Box sx={{ mt: 2 }}>
            {children}
          </Box>
        )}
      </CardContent>

      {/* 로딩 오버레이 */}
      {loading && (
        <LinearProgress
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            borderRadius: '4px 4px 0 0'
          }}
        />
      )}
    </Card>
  )
}

export default StatusCard