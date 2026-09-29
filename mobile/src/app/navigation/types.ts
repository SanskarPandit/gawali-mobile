import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  Otp: { phoneOrEmail: string };
};

export type CustomerTabParamList = {
  CustomerHome: undefined;
  CustomerCalendar: undefined;
  CustomerShop: undefined;
  CustomerBills: undefined;
  CustomerProfile: undefined;
};

export type DairyTabParamList = {
  DairyDashboard: undefined;
  DairyDeliveries: undefined;
  DairyCustomers: undefined;
  DairyProducts: undefined;
  DairyReports: undefined;
};

export type DairyStackParamList = {
  DairyTabs: NavigatorScreenParams<DairyTabParamList>;
  DairyCustomerDetail: { customerId: number };
};

export type DeliveryTabParamList = {
  DeliveryRoute: undefined;
  DeliveryHistory: undefined;
  DeliveryProfile: undefined;
};

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminDairies: undefined;
  AdminSettings: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  CustomerApp: NavigatorScreenParams<CustomerTabParamList>;
  DairyApp: NavigatorScreenParams<DairyStackParamList>;
  DeliveryApp: NavigatorScreenParams<DeliveryTabParamList>;
  AdminApp: NavigatorScreenParams<AdminTabParamList>;
};
