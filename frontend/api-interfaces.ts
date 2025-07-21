/**
 * TypeScript interfaces for the Real Estate Listings API
 * These interfaces match the response formats of the Node.js backend
 */

// Listing interface
export interface Listing {
  _id: string;
  listing_key: string;
  listing_id?: string;
  list_price: number;
  original_list_price?: number;
  previous_list_price?: number;
  lease_amount?: number;
  address: string;
  city: string;
  county: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  property_type: string;
  property_sub_type?: string;
  bedrooms: number;
  bathrooms: number;
  living_area_sqft?: number;
  lot_size_sqft?: number;
  stories?: number;
  year_built?: number;
  description?: string;
  status: string;
  on_market_timestamp?: string;
  current_price?: number;
  images: string[];
}

// SEO Content interface
export interface SeoContent {
  title: string;
  faq_content: string;
  seo_title: string;
  url_slug: string;
  meta_description: string;
  h1_heading: string;
  page_content: string;
  amenities_content?: string;
  keywords?: string[];
}

// Listings Response interface
export interface ListingsResponse {
  listings: Listing[];
  total_items: number;
  total_pages: number;
  current_page: number;
  seo_content: SeoContent;
  limit: number;
}

// Listing Detail Response interface (extends Listing with SEO content)
export interface ListingDetailResponse extends Listing, SeoContent {}

// Property Type interface
export interface PropertyType {
  _id: string;
  listing_type: string;
  name: string;
}

// Property Types Response interface
export interface PropertyTypesResponse {
  property_type: PropertyType[];
  property_sub_type: PropertyType[];
}

// Autocomplete Suggestion interface
export interface AutocompleteSuggestion {
  type: 'city' | 'county';
  value: string | { city: string; county: string };
}

// County Image interface
export interface CountyImage {
  _id: string;
  county: string;
  city?: string;
  image_url: string;
}

// Health Check Response interface
export interface HealthCheckResponse {
  status: string;
}

// API Client interface
export interface ApiClient {
  getListings(params: ListingsParams): Promise<ListingsResponse>;
  getListingDetail(listingKey: string): Promise<ListingDetailResponse>;
  getPropertyTypes(): Promise<PropertyTypesResponse>;
  getAutocomplete(query: string): Promise<AutocompleteSuggestion[]>;
  getCountiesImages(county: string, city?: string): Promise<CountyImage[]>;
  getHealth(): Promise<HealthCheckResponse>;
}

// Listings Parameters interface
export interface ListingsParams {
  city?: string;
  county?: string;
  min_price?: number;
  max_price?: number;
  property_type?: string;
  min_bedrooms?: number;
  min_bathrooms?: number;
  year_built?: number;
  skip?: number;
  limit?: number;
  sort_by?: 'recommended' | 'date-desc' | 'price-asc' | 'price-desc' | 'area-desc';
}

// Example API client implementation
export class RealEstateApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async getListings(params: ListingsParams): Promise<ListingsResponse> {
    const response = await fetch(`${this.baseUrl}/api/listings?${new URLSearchParams(params as any)}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  }

  async getListingDetail(listingKey: string): Promise<ListingDetailResponse> {
    const response = await fetch(`${this.baseUrl}/api/listings/${listingKey}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  }

  async getPropertyTypes(): Promise<PropertyTypesResponse> {
    const response = await fetch(`${this.baseUrl}/api/listings/property-type`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  }

  async getAutocomplete(query: string): Promise<AutocompleteSuggestion[]> {
    const response = await fetch(`${this.baseUrl}/api/autocomplete?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  }

  async getCountiesImages(county: string, city?: string): Promise<CountyImage[]> {
    const params = new URLSearchParams({ county });
    if (city) {
      params.append('city', city);
    }
    const response = await fetch(`${this.baseUrl}/api/counties-images?${params}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  }

  async getHealth(): Promise<HealthCheckResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  }
}
