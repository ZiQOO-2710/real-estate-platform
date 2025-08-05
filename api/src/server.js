const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Environment validation
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// 보안 및 성능 미들웨어 설정
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: !isProduction, // Disable in development for easier debugging
}));

// CORS 설정 강화
app.use(cors({
  origin: isProduction 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'] 
    : true,
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// 로깅 설정 개선
app.use(morgan(isProduction ? 'combined' : 'dev'));

// JSON 파싱 미들웨어 보안 강화
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON payload' });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000 // DoS 공격 방지
}));

// Rate limiting 개선
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: message,
      retryAfter: Math.round(windowMs / 1000)
    });
  },
});

// 다단계 Rate Limiting
const strictLimiter = createRateLimiter(
  15 * 60 * 1000, // 15분
  isProduction ? 100 : 1000, // Production: 100req/15min, Dev: 1000req/15min
  'Too many requests from this IP, please try again later.'
);

const searchLimiter = createRateLimiter(
  60 * 1000, // 1분
  isProduction ? 10 : 100, // 검색은 더 제한적
  'Too many search requests, please try again in a minute.'
);

app.use('/api/', strictLimiter);
app.use('/api/search', searchLimiter);

// 라우트 설정
const complexesRoutes = require('./routes/complexes');
const listingsRoutes = require('./routes/listings');
const transactionsRoutes = require('./routes/transactions');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');
const searchRoutes = require('./routes/search');
const integratedRoutes = require('./routes/integrated');
const naverRoutes = require('./routes/naver');
const molitRoutes = require('./routes/molit');
const molitCoordsRoutes = require('./routes/molit-coords');
const molitCoordsFastRoutes = require('./routes/molit-coords-fast');
const molitEnhancedRoutes = require('./routes/molit-enhanced')
const molitCoordsImprovedRoutes = require('./routes/molit-coords-improved')
const molitUltraFastRoutes = require('./routes/molit-ultra-fast');
const molitCoordsUpdatedRoutes = require('./routes/molit-coordinates-updated');
const molitMapRoutes = require('./routes/molit-map');
const supabaseMapRoutes = require('./routes/supabase-map');
const realEstateTransactionsRoutes = require('./routes/real-estate-transactions');
const coordinatesMapRoutes = require('./routes/coordinates-map');

app.use('/api/complexes', complexesRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/integrated', integratedRoutes);
app.use('/api/naver', naverRoutes);
app.use('/api/molit', molitRoutes);
app.use('/api/molit-coords', molitCoordsRoutes);
app.use('/api/molit-coords-fast', molitCoordsFastRoutes);
app.use('/api/molit-enhanced', molitEnhancedRoutes)
app.use('/api/molit-coords-improved', molitCoordsImprovedRoutes)
app.use('/api/molit-ultra-fast', molitUltraFastRoutes);
app.use('/api/molit-coordinates-updated', molitCoordsUpdatedRoutes);
app.use('/api/molit-map', molitMapRoutes);
app.use('/api/supabase-map', supabaseMapRoutes);
app.use('/api/real-estate-transactions', realEstateTransactionsRoutes);
app.use('/api/coordinates-map', coordinatesMapRoutes);

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
      integrated: '/api/integrated',
      naver: '/api/naver',
      molit: '/api/molit',
      'real-estate-transactions': '/api/real-estate-transactions'
    }
  });
});

// 전역 에러 핸들러 개선
app.use((err, req, res, next) => {
  // 에러 로깅 강화
  console.error('Error occurred:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    error: {
      message: err.message,
      stack: isProduction ? undefined : err.stack,
      name: err.name,
    }
  });

  // 에러 타입별 처리
  let status = err.status || err.statusCode || 500;
  let message = 'Internal server error';
  
  // 알려진 에러 타입들 처리
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized access';
  } else if (err.code === 'ECONNREFUSED') {
    status = 503;
    message = 'Database connection failed';
  } else if (err.code === 'SQLITE_ERROR') {
    status = 500;
    message = 'Database query failed';
  } else if (!isProduction && err.message) {
    message = err.message;
  }

  res.status(status).json({
    error: true,
    message,
    timestamp: new Date().toISOString(),
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Graceful shutdown 처리
const server = app.listen(PORT, () => {
  console.log(`🚀 Real Estate Platform API Server`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📊 API Documentation: http://localhost:${PORT}`);
  console.log(`🏠 Complexes: http://localhost:${PORT}/api/complexes`);
  console.log(`📋 Listings: http://localhost:${PORT}/api/listings`);
  console.log(`💰 Transactions: http://localhost:${PORT}/api/transactions`);
  console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`🔍 Search: http://localhost:${PORT}/api/search`);
  console.log(`⚡ Health Check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown 처리
const gracefulShutdown = (signal) => {
  console.log(`\n📴 Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    console.log('📴 HTTP server closed.');
    
    // 데이터베이스 연결 종료
    const db = require('./config/database');
    db.close().then(() => {
      console.log('📴 Database connections closed.');
      process.exit(err ? 1 : 0);
    }).catch((closeErr) => {
      console.error('Error closing database:', closeErr);
      process.exit(1);
    });
  });
  
  // 강제 종료 타이머 (10초 후)
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 처리되지 않은 Promise rejection 처리
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// 처리되지 않은 예외 처리
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

module.exports = app;