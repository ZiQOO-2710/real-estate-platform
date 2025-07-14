import React from 'react';
import { Box } from '@mui/material';

const NotificationContainer: React.FC = () => {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 80,
        right: 20,
        zIndex: 9998
      }}
    >
      {/* 알림 컴포넌트들이 여기에 렌더링됩니다 */}
    </Box>
  );
};

export default NotificationContainer;