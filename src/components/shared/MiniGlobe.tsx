import "./MiniGlobe.css";

export default function MiniGlobe() {
  return (
    <div className="mini-globe" aria-hidden="true">
      <div className="mini-globe__sphere">
        <div className="mini-globe__meridian mini-globe__meridian--1" />
        <div className="mini-globe__meridian mini-globe__meridian--2" />
        <div className="mini-globe__meridian mini-globe__meridian--3" />
        <div className="mini-globe__equator" />
        <div className="mini-globe__lat mini-globe__lat--n" />
        <div className="mini-globe__lat mini-globe__lat--s" />
        <div className="mini-globe__blip mini-globe__blip--1" />
        <div className="mini-globe__blip mini-globe__blip--2" />
        <div className="mini-globe__blip mini-globe__blip--3" />
      </div>
    </div>
  );
}
