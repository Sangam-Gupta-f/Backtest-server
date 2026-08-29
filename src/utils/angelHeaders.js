export const buildAngelHeaders = (key, jwtToken) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '10.70.181.29',
    'X-ClientPublicIP': '152.58.154.63',
    'X-MACAddress': '14:B5:CD:5B:C5:67',
    'X-PrivateKey': key,
  };
  if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
  return headers;
};
