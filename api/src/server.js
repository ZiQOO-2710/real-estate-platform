const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// 미들웨어 설정
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100 요청
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// 라우트 설정
const complexesRoutes = require('./routes/complexes');
const listingsRoutes = require('./routes/listings');
const transactionsRoutes = require('./routes/transactions');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');
const searchRoutes = require('./routes/search');
const integratedRoutes = require('./routes/integrated');

app.use('/api/complexes', complexesRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/integrated', integratedRoutes);

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    message: '🏠 부동산 플랫폼 API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      complexes: '/api/complexes',
      listings: '/api/listings',
      transactions: '/api/transactions',
      stats: '/api/stats',
      health: '/api/health',
      search: '/api/search',
      integrated: '/api/integrated'
    }
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API Documentation: http://localhost:${PORT}`);
  console.log(`🏠 Complexes: http://localhost:${PORT}/api/complexes`);
  console.log(`📋 Listings: http://localhost:${PORT}/api/listings`);
  console.log(`💰 Transactions: http://localhost:${PORT}/api/transactions`);
  console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`🔍 Search: http://localhost:${PORT}/api/search`);
});

module.exports = app;