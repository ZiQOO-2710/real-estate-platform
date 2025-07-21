import React from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme
} from '@mui/material'
import {
  Refresh,
  Fullscreen,
  Download,
  Timeline,
  BarChart,
  PieChart
} from '@mui/icons-material'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  PieChart as RechartsPieChart,
  Cell
} from 'recharts'

// 차트 타입별 설정
const chartTypeConfig = {
  line: { icon: Timeline, component: LineChart },
  area: { icon: Timeline, component: AreaChart },
  bar: { icon: BarChart, component: RechartsBarChart },
  pie: { icon: PieChart, component: RechartsPieChart }
}

// 커스텀 툴팁
function CustomTooltip({ active, payload, label, formatValue }) {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 1.5,
          boxShadow: 3
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 0.5 }}>
          {label}
        </Typography>
        {payload.map((entry, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: entry.color
              }}
            />
            <Typography variant="caption">
              {entry.name}: {formatValue ? formatValue(entry.value) : entry.value}
            </Typography>
          </Box>
        ))}
      </Box>
    )
  }
  return null
}

function MonitoringChart({
  title,
  subtitle,
  data = [],
  chartType = 'line',
  dataKeys = [],
  colors = ['#64b5f6', '#81c784', '#ffb74d', '#f06292'],
  height = 300,
  loading = false,
  error = null,
  onRefresh,
  onFullscreen,
  onDownload,
  showLegend = true,
  showGrid = true,
  formatValue,
  formatXAxis,
  formatYAxis,
  timeRange = '1h',
  onTimeRangeChange,
  realtime = false
}) {
  const theme = useTheme()
  const [currentChartType, setCurrentChartType] = React.useState(chartType)

  // 시간 범위 옵션
  const timeRangeOptions = [
    { value: '1h', label: '1시간' },
    { value: '24h', label: '24시간' },
    { value: '7d', label: '7일' },
    { value: '30d', label: '30일' }
  ]

  const renderChart = () => {
    if (error) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: height,
            color: 'text.secondary'
          }}
        >
          <Typography>차트를 불러올 수 없습니다</Typography>
        </Box>
      )
    }

    if (loading || !data.length) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: height,
            color: 'text.secondary'
          }}
        >
          <Typography>{loading ? '로딩 중...' : '데이터가 없습니다'}</Typography>
        </Box>
      )
    }

    const ChartComponent = chartTypeConfig[currentChartType].component

    return (
      <ResponsiveContainer width="100%" height={height}>
        {currentChartType === 'line' && (
          <LineChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />}
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 12 }}
              tickFormatter={formatXAxis}
              stroke={theme.palette.text.secondary}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              tickFormatter={formatYAxis}
              stroke={theme.palette.text.secondary}
            />
            <RechartsTooltip content={<CustomTooltip formatValue={formatValue} />} />
            {showLegend && <Legend />}
            {dataKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        )}

        {currentChartType === 'area' && (
          <AreaChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />}
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 12 }}
              tickFormatter={formatXAxis}
              stroke={theme.palette.text.secondary}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              tickFormatter={formatYAxis}
              stroke={theme.palette.text.secondary}
            />
            <RechartsTooltip content={<CustomTooltip formatValue={formatValue} />} />
            {showLegend && <Legend />}
            {dataKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        )}

        {currentChartType === 'bar' && (
          <RechartsBarChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />}
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 12 }}
              tickFormatter={formatXAxis}
              stroke={theme.palette.text.secondary}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              tickFormatter={formatYAxis}
              stroke={theme.palette.text.secondary}
            />
            <RechartsTooltip content={<CustomTooltip formatValue={formatValue} />} />
            {showLegend && <Legend />}
            {dataKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
              />
            ))}
          </RechartsBarChart>
        )}
      </ResponsiveContainer>
    )
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">{title}</Typography>
            {realtime && (
              <Chip
                label="실시간"
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.625rem',
                  bgcolor: '#4caf50',
                  color: 'white',
                  animation: 'pulse 2s infinite'
                }}
              />
            )}
          </Box>
        }
        subheader={subtitle}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* 시간 범위 선택 */}
            {onTimeRangeChange && (
              <ToggleButtonGroup
                value={timeRange}
                exclusive
                onChange={(e, value) => value && onTimeRangeChange(value)}
                size="small"
                sx={{ mr: 1 }}
              >
                {timeRangeOptions.map((option) => (
                  <ToggleButton key={option.value} value={option.value}>
                    <Typography variant="caption">{option.label}</Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}

            {/* 차트 타입 선택 */}
            <ToggleButtonGroup
              value={currentChartType}
              exclusive
              onChange={(e, value) => value && setCurrentChartType(value)}
              size="small"
              sx={{ mr: 1 }}
            >
              {Object.entries(chartTypeConfig).map(([type, config]) => (
                <ToggleButton key={type} value={type}>
                  <Tooltip title={`${type} 차트`}>
                    <config.icon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {/* 액션 버튼들 */}
            {onRefresh && (
              <Tooltip title="새로고침">
                <IconButton size="small" onClick={onRefresh} disabled={loading}>
                  <Refresh />
                </IconButton>
              </Tooltip>
            )}

            {onDownload && (
              <Tooltip title="다운로드">
                <IconButton size="small" onClick={onDownload}>
                  <Download />
                </IconButton>
              </Tooltip>
            )}

            {onFullscreen && (
              <Tooltip title="전체화면">
                <IconButton size="small" onClick={onFullscreen}>
                  <Fullscreen />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        }
      />
      
      <CardContent sx={{ pt: 0 }}>
        {renderChart()}
      </CardContent>
    </Card>
  )
}

export default MonitoringChart