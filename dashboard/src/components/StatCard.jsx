import React from 'react'
import { Card, CardContent, Typography, Box, Chip } from '@mui/material'
import { TrendingUp, TrendingDown } from '@mui/icons-material'

const StatCard = ({ 
  title, 
  value, 
  icon, 
  color = 'primary', 
  trend, 
  trendLabel,
  isPositive = true 
}) => {
  const colorMap = {
    primary: '#1a1a2e',
    secondary: '#64b5f6',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
    info: '#64b5f6'
  }

  const bgColor = colorMap[color] || colorMap.primary

  return (
    <Card 
      sx={{ 
        height: '100%',
        background: `linear-gradient(135deg, ${bgColor}15 0%, ${bgColor}05 100%)`,
        border: `1px solid ${bgColor}20`,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 20px ${bgColor}30`
        }
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h4" component="div" fontWeight="bold" sx={{ mb: 1 }}>
              {value}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {title}
            </Typography>
            
            {trend && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip
                  icon={isPositive ? <TrendingUp /> : <TrendingDown />}
                  label={`${trend} ${trendLabel}`}
                  size="small"
                  color={isPositive ? 'success' : 'error'}
                  variant="outlined"
                  sx={{ fontSize: '0.75rem' }}
                />
              </Box>
            )}
          </Box>
          
          <Box 
            sx={{ 
              color: bgColor,
              fontSize: '3rem',
              opacity: 0.7
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default StatCard