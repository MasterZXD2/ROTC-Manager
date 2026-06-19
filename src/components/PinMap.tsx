"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const pinIcon = L.divIcon({
  className: "rotc-pin-marker",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 0 0 2px #dc2626"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function PinMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={18}
      style={{ height: "100%", width: "100%" }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
      />
      <Marker position={[lat, lng]} icon={pinIcon}>
        <Popup>
          ตำแหน่งเช็คอิน
          <br />
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </Popup>
      </Marker>
    </MapContainer>
  );
}
