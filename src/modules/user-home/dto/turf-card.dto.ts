export class TurfCardDto {
  id: string;
  name: string;
  city: string;
  address: string;
  distanceKm: number | null;
  rating: number;
  reviewCount: number;
  sportsType: string;
  turfSize: string;
  status: string;
  openTime: string;
  closeTime: string;
  weekdayDayPrice: number;
  weekdayNightPrice: number;
  weekendDayPrice: number;
  weekendNightPrice: number;
  floodLights: boolean;
  parking: boolean;
  washroom: boolean;
  changingRoom: boolean;
  drinkingWater: boolean;
  seatingArea: boolean;
  cafeteria: boolean;
  footballs: boolean;
  cricketNets: boolean;
  bibs: boolean;
  goalPosts: boolean;
  wifi: boolean;
  cctv: boolean;
  firstAid: boolean;
  images: string[];
  owner: {
    name: string;
    contactNumber: string;
  };
  createdAt: Date;
}
