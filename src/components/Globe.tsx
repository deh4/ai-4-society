import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Generate random points on sphere surface
const generateSpherePoint = (r: number) => {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
};

// Generate background static particles
const generateParticles = (count: number) => {
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const p = generateSpherePoint(2); // Radius 2
        points[i * 3] = p.x;
        points[i * 3 + 1] = p.y;
        points[i * 3 + 2] = p.z;
    }
    return points;
};

const particlesPosition = generateParticles(1500);

function SignalRipples() {
    // Number of concurrent ripples
    const count = 20;

    const ripples = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            speed: 0.5 + Math.random() * 1.5, // Random speed
        }));
    }, []);

    return (
        <group>
            {ripples.map((rip, i) => (
                <Ripple key={i} speed={rip.speed} delay={i * 0.2} />
            ))}
        </group>
    );
}

// Individual expanding ripple on surface
function Ripple({ speed, delay }: { speed: number, delay: number }) {
    const meshRef = useRef<THREE.Mesh>(null!);

    // Initial random position
    const [startPos] = useMemo(() => {
        return [generateSpherePoint(2.01)]; // Just slightly above 2.0
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;

        // Add delay so they don't all start at once
        const time = state.clock.elapsedTime * speed + delay;
        const cycle = time % 1;

        // Animation: Expand and fade
        // 0 -> 1 linear expansion
        const scale = cycle * 1.5;

        // Opacity: Strong start, fade to 0
        let opacity = 1 - Math.pow(cycle, 2); // Quadratic fade

        if (opacity < 0) opacity = 0;

        // When cycle wraps (just restarted), move to new position
        // We use a simple trick: if cycle is very small, we assume it just wrapped.
        if (cycle < 0.05 && Math.random() < 0.1) {
            const newPos = generateSpherePoint(2.01);
            meshRef.current.position.copy(newPos);
            meshRef.current.lookAt(new THREE.Vector3(0, 0, 0)); // Look at center -> orients normal outwards?
            // Actually geometry is flat on XY plane typically. 
            // We want the ring to lie on the tangent plane.
            // If we lookAt(0,0,0), the Z axis points to center.
            // If RingGeometry is in XY plane, its normal is Z. 
            // So looking at 0,0,0 puts the face of the ring towards the center.
            // That's what we want (it "hugs" the surface).
        }

        // Scale the mesh
        // Base size = 0.1 radius
        meshRef.current.scale.setScalar(0.1 + scale * 0.5);

        (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.8; // Max opacity 0.8
    });

    // Set initial orientation
    useEffect(() => {
        if (meshRef.current) {
            meshRef.current.position.copy(startPos);
            meshRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        }
    }, [startPos]);

    return (
        <mesh ref={meshRef}>
            {/* Ring: innerRadius, outerRadius, thetaSegments */}
            <ringGeometry args={[0.7, 0.8, 32]} />
            <meshBasicMaterial
                color="#00ffff"
                transparent
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

export function Globe() {
    const meshRef = useRef<THREE.Mesh>(null!);
    const pointsRef = useRef<THREE.Points>(null!);

    useFrame((_, delta) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += delta * 0.1;
        }
        // Points rotate slower/differently for parallax effect? 
        // Or keep them locked.
        if (pointsRef.current) {
            pointsRef.current.rotation.y += delta * 0.05;
        }
    });

    return (
        <group rotation={[0, 0, 0.1]}>
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1.0} color="#2A9DFF" />

            <Sphere ref={meshRef} args={[2, 32, 32]}>
                <meshStandardMaterial
                    color="#1a1a1a"
                    wireframe
                    transparent
                    opacity={0.05}
                />
            </Sphere>

            <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
                <PointMaterial
                    transparent
                    color="#FF4444"
                    size={0.015}
                    sizeAttenuation={true}
                    depthWrite={false}
                    opacity={0.6}
                />
            </Points>

            {/* Ripples rotate WITH the globe so they feel grounded */}
            <RotatingGroup>
                <SignalRipples />
            </RotatingGroup>

        </group>
    );
}

function RotatingGroup({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        if (groupRef.current) {
            // Match the Globe mesh rotation speed (0.1) or Points (0.05)?
            // If they represent "events on the map", they should stick to the map.
            // But our map is abstract (points rotate at 0.05, sphere at 0.1).
            // Let's match the POINTS speed since that's the "surface".
            groupRef.current.rotation.y += delta * 0.05;
        }
    });
    return <group ref={groupRef}>{children}</group>;
}
