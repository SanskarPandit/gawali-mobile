export const ENV = {
  // Toggle this to 'QA' to use the demo data or 'PROD' to connect to a fresh database
  ENVIRONMENT: 'QA' as 'QA' | 'PROD',

  // Your existing Django endpoints
  QA_API_URL: 'https://qa-api.gawali.com/api',
  PROD_API_URL: 'https://api.gawali.com/api',
};

export const getApiBaseUrl = () => {
  return ENV.ENVIRONMENT === 'QA' ? ENV.QA_API_URL : ENV.PROD_API_URL;
};
