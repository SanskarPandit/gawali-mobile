import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type CustomerTabParamList = {
  CustomerHome: undefined;
  CustomerCalendar: undefined;
  CustomerShop: undefined;
  CustomerBills: undefined;
  CustomerProfile: undefined;
};

export type CustomerStackParamList = {
  CustomerOnboarding: undefined;
  CustomerTabs: NavigatorScreenParams<CustomerTabParamList>;
  CustomerSettings: undefined;
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
  DairyCustomerDetail: { customerId: string };
  DairyAddCustomer: undefined;
  DairyBusinessProfile: undefined;
  DairyRoutes: undefined;
  DairySettings: undefined;
};

export type DeliveryStackParamList = {
  DeliveryRoute: undefined;
  DeliverySettings: undefined;
};

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminSettings: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  CustomerApp: NavigatorScreenParams<CustomerStackParamList>;
  DairyApp: NavigatorScreenParams<DairyStackParamList>;
  DeliveryApp: NavigatorScreenParams<DeliveryStackParamList>;
  AdminApp: NavigatorScreenParams<AdminStackParamList>;
};
