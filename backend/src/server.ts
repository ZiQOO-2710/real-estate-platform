import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { Database } from './config/database';

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// 보안 미들웨어
app.use(helmet());

// CORS 설정
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// 압축 미들웨어
app.use(compression());

// 로깅 미들웨어
app.use(morgan('combined'));

// Body 파서
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API 라우트
app.use(process.env.API_PREFIX || '/api/v1', routes);

// 404 핸들러
app.use(notFoundHandler);

// 에러 핸들러
app.use(errorHandler);

// 서버 시작
const startServer = async () => {
  try {
    // 데이터베이스 연결 확인
    Database.getInstance();
    
    app.listen(PORT, () => {
      console.log(`🚀 서버가 포트 ${PORT}에서 시작되었습니다.`);
      console.log(`📊 API 문서: http://localhost:${PORT}/api/v1/health`);
      console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('서버 시작 오류:', error);
    process.exit(1);
  }
};

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  console.log('\n🔄 서버 종료 중...');
  Database.getInstance().close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🔄 서버 종료 중...');
  Database.getInstance().close();
  process.exit(0);
});

startServer();