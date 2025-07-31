import React from 'react'
import { Box, CircularProgress, Alert } from '@mui/material'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { useRegionStats } from '../utils/api'

const COLORS = ['#2196f3', '#ff9800', '#4caf50', '#f44336', '#9c27b0', '#00bcd4']

const RegionChart = ({ type = 'bar' }) => {
  const { data: regionStats, isLoading, error } = useRegionStats({ limit: 10 })

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error">
        지역 통계를 불러올 수 없습니다.
      </Alert>
    )
  }

  // 샘플 데이터 (API 오류시 대체)
  const sampleData = [
    { name: '강남구', value: 245, listings: 245 },
    { name: '서초구', value: 198, listings: 198 },
    { name: '송파구', value: 176, listings: 176 },
    { name: '강동구', value: 154, listings: 154 },
    { name: '마포구', value: 132, listings: 132 },
    { name: '용산구', value: 119, listings: 119 },
    { name: '성동구', value: 98, listings: 98 },
    { name: '광진구', value: 87, listings: 87 }
  ]

  // 실제 데이터 또는 샘플 데이터 사용
  const chartData = regionStats?.naver_regions?.length ? 
    regionStats.naver_regions.slice(0, 8).map(region => ({
      name: region.region?.substring(0, 6) || '지역명',
      value: region.listing_count || 0,
      listings: region.listing_count || 0
    })) : sampleData

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Box sx={{ 
          bgcolor: 'background.paper', 
          p: 1.5, 
          borderRadius: 1, 
          boxShadow: 2,
          border: '1px solid #e0e0e0'
        }}>
          <Box sx={{ fontWeight: 'bold', mb: 0.5 }}>{label}</Box>
          <Box sx={{ color: 'primary.main' }}>
            매물 수: {payload[0].value}개
          </Box>
        </Box>
      )
    }
    return null
  }

  if (type === 'pie') {
    return (
      <Box sx={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="name" 
            tick={{ fontSize: 12 }}
            stroke="#666"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            stroke="#666"
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            dataKey="value" 
            fill="#2196f3"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  )
}

export default RegionChart