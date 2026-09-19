"use client";

import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useEffect } from "react";

// fix default icon path issue under bundlers
const userIcon = L.divIcon({
  className: "rotc-user-marker",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px #2563eb"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const targetIcon = L.divIcon({
  className: "rotc-target-marker",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#15803d;border:3px solid white;box-shadow:0 0 0 2px #15803d"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  user: { lat: number; lng: number } | null;
  userAccuracy?: number | null;
  targets: Array<{ id: string; name: string; lat: number; lng: number }>;
  radius: number;
  height?: string;
}

export function CheckinMap({ user, userAccuracy, targets, radius, height = "240px" }: Props) {
  const center = user ?? targets[0] ?? { lat: 13.7563, lng: 100.5018 };

  return (
    <div className="overflow-hidden rounded-xl border" style={{ height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={18}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        {targets.map((t) => (
          <Fragment key={t.id}>
            <Marker position={[t.lat, t.lng]} icon={targetIcon} />
            <Circle
              center={[t.lat, t.lng]}
              radius={radius}
              pathOptions={{ color: "#15803d", fillColor: "#15803d", fillOpacity: 0.1 }}
            />
          </Fragment>
        ))}
        {user && userAccuracy !== null && userAccuracy !== undefined && (
          <Circle
            center={[user.lat, user.lng]}
            radius={Math.max(userAccuracy, 1)}
            pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.08 }}
          />
        )}
        {user && <Marker position={[user.lat, user.lng]} icon={userIcon} />}
        {user && <Recenter lat={user.lat} lng={user.lng} />}
      </MapContainer>
    </div>
  );
}
