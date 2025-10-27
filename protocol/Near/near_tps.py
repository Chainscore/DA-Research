# https://api-docs.celenium.io/
# https://api-mainnet.celenium.io/v1/stats/tps
import requests
import json

# ...existing code...

def fetch_tps_data():
    API_URL = "https://api.nearblocks.io/v1/stats"

    print('Fetching Near TPS data...')
    try:
        response = requests.get(API_URL)
        response.raise_for_status()
        data = response.json()
        return data
    except requests.exceptions.RequestException as e:
        print(f"API Error: {str(e)}")
        return []


if __name__ == "__main__":
    data = fetch_tps_data()
    print(f"\nFinal TPS: {data["stats"][0]['tps']}")