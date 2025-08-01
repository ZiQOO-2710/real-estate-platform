import React from 'react';
import { Box, Typography } from '@mui/material';

const Dashboard: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        대시보드
      </Typography>
      <Typography variant="body1">
        대시보드 페이지입니다.
      </Typography>
    </Box>
  );
};

export default Dashboard;