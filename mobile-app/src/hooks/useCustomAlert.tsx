import { useState, useCallback } from 'react';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  type?: 'success' | 'error' | 'warning' | 'info';
}

export const useCustomAlert = () => {
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [visible, setVisible] = useState(false);

  const showAlert = useCallback((
    title: string,
    message?: string,
    buttons?: AlertButton[],
    type?: 'success' | 'error' | 'warning' | 'info'
  ) => {
    // Determine type based on title if not explicitly provided
    let alertType = type;
    if (!alertType) {
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('success')) {
        alertType = 'success';
      } else if (lowerTitle.includes('error') || lowerTitle.includes('failed')) {
        alertType = 'error';
      } else if (lowerTitle.includes('warning')) {
        alertType = 'warning';
      } else {
        alertType = 'info';
      }
    }

    setAlertConfig({
      title,
      message,
      buttons: buttons || [{ text: 'OK', style: 'default' }],
      type: alertType,
    });
    setVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setVisible(false);
    setTimeout(() => setAlertConfig(null), 300);
  }, []);

  return {
    alertConfig,
    visible,
    showAlert,
    hideAlert,
  };
};
