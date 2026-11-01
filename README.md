# 🌤️ SkyCast – Interactive Weather App

A responsive weather website where you can search any city and explore its current conditions, an interactive 24-hour chart and a 7-day forecast. The page changes its background to match the weather.

Built with plain **HTML, CSS and JavaScript** and the free [Open-Meteo](https://open-meteo.com/) API. It needs no backend and no API key.

<img width="1322" height="725" alt="image" src="https://github.com/user-attachments/assets/c41f9d10-55b7-43d1-9d6a-b0780e1cfb41" />
<img width="1518" height="729" alt="image" src="https://github.com/user-attachments/assets/72674080-6de8-430e-9870-e108e6c7eb3e" />



**Live demo:** https://varshag-28.github.io/weather-app/

## Features

- **City search with suggestions:** type a city name, then pick from the dropdown (arrow keys and Enter work too)
- **Current weather:** temperature, "feels like", condition, humidity, wind speed and direction, pressure, precipitation, UV index, sunrise and sunset
- **Interactive 24-hour chart:** hover or touch the chart to see the time, temperature, condition and chance of rain for each hour
- **7-day forecast:** tap a day to see that day's hourly chart
- **°C / °F toggle:** switches units for temperature and wind speed
- **My location:** one click to get the weather where you are (browser permission needed)
- **Weather-based themes:** the background changes for clear, cloudy, fog, rain, snow, storm and night
- **Recent searches:** your last five cities are saved in the browser for quick access
- **Responsive design:** works on desktop, tablet and phone
- **Error handling:** clear messages if a city is not found or the connection fails

## Tech stack

| Part | Tool |
|------|------|
| Structure | HTML5 |
| Styling | CSS3 (Grid, Flexbox, gradients, glass effect, media queries) |
| Logic | Vanilla JavaScript (Fetch API, async/await, DOM, SVG) |
| Data | Open-Meteo Geocoding API and Forecast API |
| Storage | `localStorage` (recent searches) |

## How it works

1. The search box calls the Open-Meteo **Geocoding API** to turn a city name into coordinates.
2. The app then calls the **Forecast API** with those coordinates and the selected units to get current, hourly and daily data.
3. JavaScript maps the WMO weather codes to icons, descriptions and a background theme.
4. The hourly chart is drawn as an SVG, with pointer events to show a tooltip for the hour under your cursor or finger.
5. Switching between °C and °F fetches the forecast again, so the values come straight from the API.

## Project structure

```
weather-app/
├── index.html   # Page layout
├── style.css    # Design, themes and responsive rules
├── script.js    # API calls, rendering, chart and interactions
└── README.md
```

## Run it locally

No installation is needed.

1. Download or clone the repository:
   ```bash
   git clone https://github.com/varshag-28/weather-app.git
   ```
2. Open `index.html` in your browser. An internet connection is required for the weather data.

## Publish it with GitHub Pages

1. Push the files to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, and click **Save**.
4. After a minute, your site is live at `https://<your-username>.github.io/<repository-name>/`.

## Possible improvements

- Air quality and pollen information
- Saved favourite cities
- Weather alerts and a rain radar map
- Animated weather backgrounds
- A Python (Flask) version that fetches the data on the server

## Credits

Weather data by [Open-Meteo](https://open-meteo.com/) (free for non-commercial use, with attribution).

## Author

**Varsha G** · [LinkedIn](https://www.linkedin.com/in/varsha-g-80037226) · [GitHub](https://github.com/varshag-28)
