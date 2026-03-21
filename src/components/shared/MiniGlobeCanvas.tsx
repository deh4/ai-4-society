import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

const SPHERE_RADIUS = 0.8;

const generateSpherePoint = (r: number) => {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
};

const generateParticles = (count: number) => {
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const p = generateSpherePoint(SPHERE_RADIUS);
        points[i * 3] = p.x;
        points[i * 3 + 1] = p.y;
        points[i * 3 + 2] = p.z;
    }
    return points;
};

const particlesPosition = generateParticles(200);

function MiniRipple({ speed, delay }: { speed: number; delay: number }) {
    const mainRef = useRef<THREE.Mesh>(null!);
    const subRef = useRef<THREE.Mesh>(null!);

    const [startPos] = useMemo(() => {
        return [generateSpherePoint(SPHERE_RADIUS + 0.01)];
    }, []);

    useFrame((state) => {
        if (!mainRef.current || !subRef.current) return;

        const time = state.clock.elapsedTime * speed + delay;
        const cycle = time % 1;

        const scaleMain = cycle * 0.12;
        let opacityMain = 1 - Math.pow(cycle, 1.5);
        if (opacityMain < 0) opacityMain = 0;

        const scaleSub = cycle * 0.08;
        let opacitySub = (1 - Math.pow(cycle, 2)) * 0.5;
        if (cycle < 0.05) opacitySub = 0;

        if (cycle < 0.02 && Math.random() < 0.1) {
            const newPos = generateSpherePoint(SPHERE_RADIUS + 0.01);
            mainRef.current.position.copy(newPos);
            mainRef.current.lookAt(new THREE.Vector3(0, 0, 0));
            subRef.current.position.copy(newPos);
            subRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        }

        mainRef.current.scale.setScalar(scaleMain);
        (mainRef.current.material as THREE.MeshBasicMaterial).opacity = opacityMain;
        subRef.current.scale.setScalar(scaleSub);
        (subRef.current.material as THREE.MeshBasicMaterial).opacity = opacitySub;
    });

    useEffect(() => {
        if (mainRef.current && subRef.current) {
            mainRef.current.position.copy(startPos);
            mainRef.current.lookAt(new THREE.Vector3(0, 0, 0));
            subRef.current.position.copy(startPos);
            subRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        }
    }, [startPos]);

    return (
        <group>
            <mesh ref={mainRef}>
                <ringGeometry args={[0.9, 1.0, 32]} />
                <meshBasicMaterial
                    color="#00f0ff"
                    transparent
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            <mesh ref={subRef}>
                <ringGeometry args={[0.9, 1.0, 32]} />
                <meshBasicMaterial
                    color="#3b82f6"
                    transparent
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
}

function MiniSignalRipples() {
    const ripples = useMemo(() => {
        return new Array(3).fill(0).map(() => ({
            speed: 0.2 + Math.random() * 0.3,
        }));
    }, []);

    return (
        <group>
            {ripples.map((rip, i) => (
                <MiniRipple key={i} speed={rip.speed} delay={i * 0.5} />
            ))}
        </group>
    );
}

function RotatingGroup({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.05;
        }
    });
    return <group ref={groupRef}>{children}</group>;
}

function MiniGlobeScene() {
    const meshRef = useRef<THREE.Mesh>(null!);
    const pointsRef = useRef<THREE.Points>(null!);

    useFrame((_, delta) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += delta * 0.1;
        }
        if (pointsRef.current) {
            pointsRef.current.rotation.y += delta * 0.05;
        }
    });

    return (
        <group rotation={[0, 0, 0.1]}>
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1.0} color="#2A9DFF" />

            <Sphere ref={meshRef} args={[SPHERE_RADIUS, 32, 32]}>
                <meshStandardMaterial
                    color="#2A9DFF"
                    wireframe
                    transparent
                    opacity={0.15}
                />
            </Sphere>

            <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
                <PointMaterial
                    transparent
                    color="#FF4444"
                    size={0.02}
                    sizeAttenuation={true}
                    depthWrite={false}
                    opacity={0.8}
                />
            </Points>

            <RotatingGroup>
                <MiniSignalRipples />
            </RotatingGroup>
        </group>
    );
}

export default function MiniGlobeCanvas() {
    return (
        <Canvas
            style={{ width: 28, height: 28 }}
            camera={{ position: [0, 0, 2.5] }}
            gl={{ alpha: true }}
        >
            <MiniGlobeScene />
        </Canvas>
    );
}
