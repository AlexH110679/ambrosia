// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Animated,
  StatusBar,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ProductCard from '../components/ProductCard';
import { fetchProducts, searchProducts, fetchCustomCategories } from '../services/productService';
import { COLORS, SIZES, CATEGORIES } from '../constants/theme';
import { useCart } from '../context/CartContext';
import { useAlert } from '../context/AlertContext';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const { itemCount } = useCart();
  const { showAlert } = useAlert();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [allCategories, setAllCategories] = useState(CATEGORIES);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const scrollY = useRef(new Animated.Value(0)).current;
  const categoryScrollRef = useRef(null);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const custom = await fetchCustomCategories();
        if (custom && custom.length > 0) {
          const defaultIds = new Set(CATEGORIES.map(c => c.id));
          const filteredCustom = custom.filter(c => !defaultIds.has(c.id));
          setAllCategories([...CATEGORIES, ...filteredCustom]);
        } else {
          setAllCategories(CATEGORIES);
        }
      } catch (e) {
        console.warn('Error loading custom categories in HomeScreen:', e);
      }
    };
    const unsubscribe = navigation.addListener('focus', loadCategories);
    loadCategories();
    return unsubscribe;
  }, [navigation]);

  const orderedCategories = React.useMemo(() => {
    if (activeCategory === 'all') {
      return allCategories;
    }
    const allTab = allCategories.find(c => c.id === 'all');
    const activeTab = allCategories.find(c => c.id === activeCategory);
    const others = allCategories.filter(c => c.id !== 'all' && c.id !== activeCategory);
    return [allTab, activeTab, ...others].filter(Boolean);
  }, [activeCategory, allCategories]);

  useEffect(() => {
    if (categoryScrollRef.current) {
      categoryScrollRef.current.scrollTo({ x: 0, animated: true });
    }
  }, [activeCategory]);

  const loadMasterCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchProducts('all');
      setAllProducts(data);
    } catch (e) {
      console.error('Error loading master catalog:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const filterProducts = useCallback((cat, term, sort) => {
    let filtered = [...allProducts];

    if (cat !== 'all') {
      filtered = filtered.filter(p => p.category === cat);
    }

    if (term.trim().length > 0) {
      const lower = term.toLowerCase();
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().includes(lower)) || 
        (p.type && p.type.toLowerCase().includes(lower)) || 
        (p.description && p.description.toLowerCase().includes(lower))
      );
    }

    if (sort === 'price-low') filtered.sort((a, b) => a.price - b.price);
    else if (sort === 'price-high') filtered.sort((a, b) => b.price - a.price);
    else if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));

    setProducts(filtered);
  }, [allProducts]);

  const handleAdminAccess = () => {
    setAdminModalVisible(true);
  };

  const verifyAdmin = () => {
    if (adminPin === '2026') {
      setAdminPin('');
      setAdminModalVisible(false);
      navigation.navigate('Admin');
    } else {
      showAlert('Acceso Denegado', 'El PIN ingresado es incorrecto.', [{ text: 'Aceptar', style: 'destructive' }]);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadMasterCatalog);
    loadMasterCatalog(); // Initial load
    return unsubscribe;
  }, [navigation, loadMasterCatalog]);

  useEffect(() => {
    filterProducts(activeCategory, searchTerm, sortBy);
  }, [activeCategory, sortBy, allProducts, filterProducts]);

  useEffect(() => {
    const delay = setTimeout(() => {
      filterProducts(activeCategory, searchTerm, sortBy);
    }, 150); // Reduced delay since it's local filtering now!
    return () => clearTimeout(delay);
  }, [searchTerm, filterProducts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMasterCatalog();
  }, [loadMasterCatalog]);

  const handleProductPress = useCallback((product) => {
    navigation.navigate('ProductDetail', { product });
  }, [navigation]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);

  const renderHeader = () => (
    <View>
      {/* Hero Section */}
      <LinearGradient
        colors={['#0a0a0c', '#1a1020', '#0a0a0c']}
        style={styles.hero}
      >
        <View style={styles.heroContent}>
          <TouchableOpacity onLongPress={handleAdminAccess} delayLongPress={1000} activeOpacity={0.9}>
            <Text style={styles.heroTitle}>Thiago's{'\n'}Licores & Snacks</Text>
          </TouchableOpacity>
          <Text style={styles.heroDesc}>Cervezas artesanales, licores finos del mundo y los mejores snacks</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>18+</Text>
              <Text style={styles.heroStatLabel}>Marcas</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>4</Text>
              <Text style={styles.heroStatLabel}>Módulos</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>⚡</Text>
              <Text style={styles.heroStatLabel}>Express</Text>
            </View>
          </View>
        </View>
        {/* Decorative Gold Bar */}
        <View style={styles.goldBar} />
      </LinearGradient>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="¿Qué vas a pedir hoy?"
            placeholderTextColor={COLORS.textSecondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
            autoCorrect={false}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {/* Sort Button */}
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => {
            const opts = ['default', 'price-low', 'price-high', 'name'];
            const current = opts.indexOf(sortBy);
            setSortBy(opts[(current + 1) % opts.length]);
          }}
        >
          <Ionicons name="swap-vertical" size={18} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {/* Category Tabs */}
      <ScrollView
        ref={categoryScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {orderedCategories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryTab,
              activeCategory === cat.id && styles.categoryTabActive,
            ]}
            onPress={() => setActiveCategory(cat.id)}
            activeOpacity={0.8}
          >
            {activeCategory === cat.id ? (
              <LinearGradient
                colors={cat.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.categoryTabGradient}
              >
                <Ionicons name={cat.icon} size={16} color="#fff" />
                <Text style={[styles.categoryTabText, { color: '#fff' }]}>{cat.label}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.categoryTabInner}>
                <Ionicons name={cat.icon} size={16} color={COLORS.textSecondary} />
                <Text style={styles.categoryTabText}>{cat.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results Info */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsText}>
          {loading ? 'Cargando...' : `${products.length} producto${products.length !== 1 ? 's' : ''}`}
        </Text>
        <Text style={styles.sortLabel}>
          {sortBy === 'price-low' && '↑ Precio'}
          {sortBy === 'price-high' && '↓ Precio'}
          {sortBy === 'name' && 'A-Z'}
          {sortBy === 'default' && 'Recomendados'}
        </Text>
      </View>
    </View>
  );

  const renderProduct = ({ item, index }) => (
    <View style={[
      styles.productWrapper,
      index % 2 === 0 ? { paddingRight: SIZES.xs } : { paddingLeft: SIZES.xs },
    ]}>
      <ProductCard product={item} onPress={handleProductPress} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />

      {/* Animated Sticky Header */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <TouchableOpacity onLongPress={handleAdminAccess} delayLongPress={1000}>
          <Text style={styles.stickyTitle}>Thiago's</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Cart')}>
          <View style={styles.cartBtn}>
            <Ionicons name="bag" size={20} color={COLORS.textPrimary} />
            {itemCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{itemCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>

      {loading && products.length === 0 ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loaderText}>Cargando productos...</Text>
        </View>
      ) : (
        <Animated.FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          renderItem={renderProduct}
          ListHeaderComponent={renderHeader()}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={52} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Sin productos</Text>
              <Text style={styles.emptyDesc}>No encontramos productos que coincidan con tu búsqueda.</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />
          }
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          columnWrapperStyle={styles.columnWrapper}
        />
      )}

      {/* Floating Cart Button */}
      {itemCount > 0 && (
        <TouchableOpacity
          style={styles.floatingCart}
          onPress={() => navigation.navigate('Cart')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[COLORS.gold, COLORS.goldDark]}
            style={styles.floatingCartGradient}
          >
            <Ionicons name="bag" size={22} color={COLORS.bgPrimary} />
            <Text style={styles.floatingCartText}>Ver Carrito ({itemCount})</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.bgPrimary} />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Admin Password Modal */}
      <Modal visible={adminModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a1a22', width: '100%', maxWidth: 320, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}>
            <Ionicons name="lock-closed" size={40} color={COLORS.gold} style={{ marginBottom: 10 }} />
            <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 5 }}>Acceso Administrativo</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 20, textAlign: 'center' }}>Ingresa el PIN para acceder al panel de control de inventario.</Text>
            <TextInput
              style={{ width: '100%', height: 50, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, color: COLORS.textPrimary, fontSize: 18, textAlign: 'center', letterSpacing: 10, marginBottom: 20 }}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={adminPin}
              onChangeText={setAdminPin}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 }}
                onPress={() => { setAdminModalVisible(false); setAdminPin(''); }}
              >
                <Text style={{ color: COLORS.textMuted, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: 44, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', borderRadius: 8 }}
                onPress={verifyAdmin}
              >
                <Text style={{ color: COLORS.bgPrimary, fontWeight: '700' }}>Ingresar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: 12,
    backgroundColor: COLORS.bgPrimary + 'ee',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stickyTitle: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  cartBtn: {
    position: 'relative',
    width: 40,
    height: 40,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.bgPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  hero: {
    paddingTop: SIZES.lg,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  heroContent: {
    paddingBottom: SIZES.md,
  },
  heroTagline: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: SIZES.sm,
  },
  heroTitle: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    marginBottom: SIZES.sm,
  },
  heroDesc: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SIZES.lg,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
  },
  heroStat: {
    alignItems: 'center',
  },
  heroStatNum: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '700',
  },
  heroStatLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  goldBar: {
    height: 3,
    backgroundColor: COLORS.gold,
    marginTop: SIZES.md,
    borderRadius: 2,
    opacity: 0.6,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    backgroundColor: COLORS.bgPrimary,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.sm + 4,
    gap: SIZES.sm,
    height: 44,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  sortBtn: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryScroll: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    gap: SIZES.sm,
  },
  categoryTab: {
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryTabActive: {
    borderColor: 'transparent',
  },
  categoryTabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIZES.md,
    paddingVertical: 9,
  },
  categoryTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIZES.md,
    paddingVertical: 9,
    backgroundColor: COLORS.bgSecondary,
  },
  categoryTabText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  resultsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.sm,
  },
  resultsText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  sortLabel: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: SIZES.md,
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  productWrapper: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.md,
  },
  loaderText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SIZES.xxl,
    paddingHorizontal: SIZES.lg,
    gap: SIZES.sm,
  },
  emptyTitle: {
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: SIZES.sm,
  },
  emptyDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  floatingCart: {
    position: 'absolute',
    bottom: 20,
    left: SIZES.md,
    right: SIZES.md,
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  floatingCartGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: SIZES.lg,
    gap: SIZES.sm,
  },
  floatingCartText: {
    color: COLORS.bgPrimary,
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },
});

export default HomeScreen;
