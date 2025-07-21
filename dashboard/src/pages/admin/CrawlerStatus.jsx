import React from 'react'
import {
  Box,
  Grid,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  LinearProgress,
  Card,
  CardContent,
  CardHeader,
  Switch,
  FormControlLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material'
import {
  PlayArrow,
  Stop,
  Pause,
  Refresh,
  Settings,
  Visibility,
  Edit,
  Delete,
  Add,
  ExpandMore,
  Computer,
  Speed,
  Storage,
  Timeline
} from '@mui/icons-material'
import StatusCard from '../../components/admin/StatusCard'
import MonitoringChart from '../../components/admin/MonitoringChart'

// 샘플 크롤러 데이터
const crawlers = [
  {
    id: 1,
    name: '강남구 크롤러',
    status: 'running',
    region: '강남구',
    progress: 65,
    processedCount: 1250,
    totalCount: 1920,
    lastUpdate: '2분 전',
    vpnStatus: 'WARP',
    workerCount: 3,
    errorsToday: 2
  },
  {
    id: 2,
    name: '서초구 크롤러',
    status: 'running',
    region: '서초구',
    progress: 82,
    processedCount: 980,
    totalCount: 1200,
    lastUpdate: '1분 전',
    vpnStatus: 'NordVPN',
    workerCount: 2,
    errorsToday: 0
  },
  {
    id: 3,
    name: '송파구 크롤러',
    status: 'paused',
    region: '송파구',
    progress: 45,
    processedCount: 678,
    totalCount: 1500,
    lastUpdate: '15분 전',
    vpnStatus: 'WARP',
    workerCount: 1,
    errorsToday: 5
  },
  {
    id: 4,
    name: '전국 단지 크롤러',
    status: 'stopped',
    region: '전국',
    progress: 0,
    processedCount: 0,
    totalCount: 50000,
    lastUpdate: '2시간 전',
    vpnStatus: 'None',
    workerCount: 0,
    errorsToday: 0
  }
]

// 상태별 색상 및 텍스트
const statusConfig = {
  running: { color: '#4caf50', text: '실행중', bgColor: 'rgba(76, 175, 80, 0.1)' },
  paused: { color: '#ff9800', text: '일시정지', bgColor: 'rgba(255, 152, 0, 0.1)' },
  stopped: { color: '#9e9e9e', text: '중지됨', bgColor: 'rgba(158, 158, 158, 0.1)' },
  error: { color: '#f44336', text: '오류', bgColor: 'rgba(244, 67, 54, 0.1)' }
}

// VPN 상태별 색상
const vpnStatusColors = {
  'WARP': '#64b5f6',
  'NordVPN': '#4caf50',
  'None': '#9e9e9e'
}

// 샘플 성능 데이터
const performanceData = [
  { time: '12:00', throughput: 120, errors: 2, vpnSwitches: 1 },
  { time: '12:15', throughput: 145, errors: 0, vpnSwitches: 0 },
  { time: '12:30', throughput: 98, errors: 5, vpnSwitches: 2 },
  { time: '12:45', throughput: 167, errors: 1, vpnSwitches: 0 },
  { time: '13:00', throughput: 134, errors: 3, vpnSwitches: 1 }
]

function CrawlerStatus() {
  const [selectedCrawler, setSelectedCrawler] = React.useState(null)
  const [showSettings, setShowSettings] = React.useState(false)

  const handleCrawlerAction = (crawlerId, action) => {
    console.log(`크롤러 ${crawlerId}에 대한 ${action} 실행`)
    // 실제로는 API 호출로 크롤러 제어
  }

  const getStatusChip = (status) => {
    const config = statusConfig[status]
    return (
      <Chip
        label={config.text}
        size="small"
        sx={{
          bgcolor: config.bgColor,
          color: config.color,
          fontWeight: 'bold',
          minWidth: 70
        }}
      />
    )
  }

  const getTotalStats = () => {
    const running = crawlers.filter(c => c.status === 'running').length
    const totalProcessed = crawlers.reduce((sum, c) => sum + c.processedCount, 0)
    const totalErrors = crawlers.reduce((sum, c) => sum + c.errorsToday, 0)
    const avgProgress = Math.round(crawlers.reduce((sum, c) => sum + c.progress, 0) / crawlers.length)

    return { running, totalProcessed, totalErrors, avgProgress }
  }

  const stats = getTotalStats()

  return (
    <Box sx={{ p: 3 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
            크롤러 상태 관리
          </Typography>
          <Typography variant="body1" color="text.secondary">
            실행 중인 크롤러들의 상태를 모니터링하고 제어합니다
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => console.log('전체 새로고침')}
          >
            새로고침
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => console.log('새 크롤러 추가')}
          >
            크롤러 추가
          </Button>
        </Box>
      </Box>

      {/* 전체 통계 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="실행중인 크롤러"
            value={stats.running}
            unit={`/ ${crawlers.length}`}
            status="success"
            description="활성 크롤러"
            progress={stats.avgProgress}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="처리된 매물"
            value={stats.totalProcessed.toLocaleString()}
            unit="개"
            status="info"
            description="오늘 누적"
            trend="up"
            trendValue="+1.2K"
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="평균 진행률"
            value={stats.avgProgress}
            unit="%"
            status="warning"
            description="전체 크롤러 평균"
            progress={stats.avgProgress}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <StatusCard
            title="오류 발생"
            value={stats.totalErrors}
            status={stats.totalErrors > 5 ? "error" : "success"}
            description="오늘 총 오류"
            trend={stats.totalErrors > 5 ? "up" : "down"}
            trendValue={stats.totalErrors > 5 ? `+${stats.totalErrors}` : "정상"}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* 크롤러 목록 */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardHeader
              title="크롤러 목록"
              action={
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="자동 새로고침"
                />
              }
            />
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>이름/지역</TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell>진행률</TableCell>
                    <TableCell>VPN</TableCell>
                    <TableCell>워커</TableCell>
                    <TableCell>오류</TableCell>
                    <TableCell>작업</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {crawlers.map((crawler) => (
                    <TableRow key={crawler.id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="subtitle2">
                            {crawler.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {crawler.region} • {crawler.lastUpdate}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {getStatusChip(crawler.status)}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ width: 100 }}>
                          <LinearProgress
                            variant="determinate"
                            value={crawler.progress}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: 'rgba(0,0,0,0.1)',
                              '& .MuiLinearProgress-bar': {
                                borderRadius: 3,
                                bgcolor: statusConfig[crawler.status].color
                              }
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {crawler.processedCount.toLocaleString()} / {crawler.totalCount.toLocaleString()}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={crawler.vpnStatus}
                          size="small"
                          sx={{
                            bgcolor: `${vpnStatusColors[crawler.vpnStatus]}20`,
                            color: vpnStatusColors[crawler.vpnStatus],
                            fontWeight: 'bold'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Computer fontSize="small" color="action" />
                          <Typography variant="body2">
                            {crawler.workerCount}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography 
                          variant="body2" 
                          color={crawler.errorsToday > 0 ? 'error' : 'success'}
                          sx={{ fontWeight: 'bold' }}
                        >
                          {crawler.errorsToday}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {crawler.status === 'running' ? (
                            <>
                              <IconButton
                                size="small"
                                onClick={() => handleCrawlerAction(crawler.id, 'pause')}
                                color="warning"
                              >
                                <Pause />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleCrawlerAction(crawler.id, 'stop')}
                                color="error"
                              >
                                <Stop />
                              </IconButton>
                            </>
                          ) : (
                            <IconButton
                              size="small"
                              onClick={() => handleCrawlerAction(crawler.id, 'start')}
                              color="success"
                            >
                              <PlayArrow />
                            </IconButton>
                          )}
                          <IconButton
                            size="small"
                            onClick={() => setSelectedCrawler(crawler)}
                            color="primary"
                          >
                            <Visibility />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => console.log('크롤러 설정')}
                          >
                            <Settings />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>

        {/* 성능 모니터링 */}
        <Grid item xs={12} lg={4}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 실시간 성능 */}
            <Card>
              <CardContent>
                <MonitoringChart
                  title="처리량"
                  data={performanceData}
                  dataKeys={['throughput']}
                  colors={['#64b5f6']}
                  height={200}
                  showLegend={false}
                  realtime={true}
                  formatValue={(value) => `${value}개/분`}
                />
              </CardContent>
            </Card>

            {/* 크롤러 설정 패널 */}
            <Card>
              <CardHeader
                title="빠른 설정"
                action={
                  <IconButton onClick={() => setShowSettings(!showSettings)}>
                    <Settings />
                  </IconButton>
                }
              />
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>VPN 모드</InputLabel>
                    <Select defaultValue="auto" label="VPN 모드">
                      <MenuItem value="auto">자동</MenuItem>
                      <MenuItem value="warp">WARP 우선</MenuItem>
                      <MenuItem value="nordvpn">NordVPN 우선</MenuItem>
                      <MenuItem value="off">비활성화</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    label="처리 간격 (초)"
                    type="number"
                    size="small"
                    defaultValue={3}
                    inputProps={{ min: 1, max: 10 }}
                  />

                  <TextField
                    label="최대 워커 수"
                    type="number"
                    size="small"
                    defaultValue={5}
                    inputProps={{ min: 1, max: 10 }}
                  />

                  <FormControlLabel
                    control={<Switch defaultChecked />}
                    label="자동 재시작"
                  />

                  <Button variant="outlined" startIcon={<Settings />}>
                    고급 설정
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>

      {/* 상세 정보 모달/아코디언 (선택된 크롤러) */}
      {selectedCrawler && (
        <Paper sx={{ mt: 3, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {selectedCrawler.name} 상세 정보
          </Typography>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>실시간 로그</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                <div>[13:45:12] 강남구 단지 크롤링 시작</div>
                <div>[13:45:10] VPN 연결 확인: WARP</div>
                <div>[13:45:08] 워커 3개 초기화 완료</div>
                <div>[13:45:05] 데이터베이스 연결 성공</div>
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>처리 통계</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">처리 속도</Typography>
                  <Typography variant="h6">45개/분</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">성공률</Typography>
                  <Typography variant="h6">98.5%</Typography>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Paper>
      )}
    </Box>
  )
}

export default CrawlerStatus